import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseUserIntent,
  toolCallForIntent,
} from '../agent/runtime/chatAgentRuntime'
import {
  chooseHigherPriorityIntent,
  isListEditIntentType,
  mergePlannerIntentWithRules,
  requiresConfirmation,
} from '../agent/policy'
import { transitionStateFromIntent } from '../agent/stateMachine'
import {
  getTelemetrySnapshot,
  incrementMetric,
  recordIntentOutcome,
} from '../agent/telemetry'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  dispatchSetDirectGoals,
  dispatchPreviewNavPlan,
  dispatchStartNavigation,
  subscribeDwellEvent,
  subscribeMapCommand,
  subscribeMapSnapshot,
  type AgentMapSnapshot,
} from '../agent/runtime/agentEventBus'
import {
  createAssistantOutputPipeline,
  type AssistantOutputPipeline,
  type PipelineItem,
} from './chatAgent/assistantOutputPipeline'
import { useTts } from './useTts'
import { planWithLlm } from '../agent/runtime/llmPlanner'
import { normalizeListHint } from '../agent/listHintNormalize'
import type {
  AgentContext,
  AgentIntent,
  AgentIntentType,
  AgentIntentSource,
  AgentMessage,
  DwellBookCandidate,
  RecognitionKind,
  ShoppingListEntry,
  ToolExecutionContext,
  ToolResult,
} from '../agent/types'
import { appendUserMessageAndStore } from './chatAgent/helpers'
import { mergePlannedToolCall } from './chatAgent/toolCallMerge'
import { useExistingListGate } from './chatAgent/useExistingListGate'
import { isProceedToken } from './chatAgent/proceedToken'
import { resolvePendingConfirmationReply } from './chatAgent/pendingConfirmationReply'
import { buildNavStartPrompt, CHAT_AGENT_MESSAGES } from './chatAgent/messages'
import { resolveUnknownChatReply } from './chatAgent/resolveUnknownChatReply'
import { isDemoMode } from '../config/demoMode'
import type { TasteSeed } from '../types/onboarding'
import { useDemoOrchestrator } from './useDemoOrchestrator'
import { fixtureRobotDirectGoals } from '../data/fixtureRobotRoute'
import { useToolRunner } from './chatAgent/useToolRunner'
import { useChatAgentSession } from './chatAgent/useChatAgentSession'
import { completeCheckoutPurchase } from '../agent/tools/checkoutCompletion'

const initialContextValue = (): AgentContext => ({
  state: 'INIT',
  mobilityPaused: false,
  listType: '쇼핑리스트',
  activeUsersId: undefined,
  shoppingList: [],
  cartItems: [],
  pendingDwellBook: null,
  awaitingDwellFeedback: false,
  checkoutStatus: 'idle',
  receipt: null,
  recentlyRecommendedBookIds: [],
  recommendationDiversityRound: 0,
  pendingConfirmation: null,
  lastToolResult: null,
})

const initialMessages: AgentMessage[] = []

function extractRecommendationTitles(result: ToolResult | null): string[] {
  if (!result?.ok || result.toolName !== 'recommendationTool') return []
  const lines = (result.data as { recommendations?: unknown } | undefined)?.recommendations
  if (!Array.isArray(lines)) return []
  return lines
    .map((line) => {
      if (typeof line !== 'string') return ''
      const body = line.replace(/^[^0-9]*\d+\.\s*/, '')
      const [title] = body.split(/\s-\s/)
      return title.trim()
    })
    .filter((title) => title.length > 0)
}

function extractRecommendationCandidates(result: ToolResult | null): ShoppingListEntry[] {
  if (!result?.ok || result.toolName !== 'recommendationTool') return []
  const candidates = (result.data as { candidates?: unknown } | undefined)?.candidates
  if (!Array.isArray(candidates)) return []
  const rows: Array<ShoppingListEntry | null> = candidates
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as { booksId?: unknown; title?: unknown; authors?: unknown; coverImageUrl?: unknown }
      const booksId = String(row.booksId ?? '').trim()
      const title = String(row.title ?? '').trim()
      if (!booksId || !title) return null
      return {
        booksId,
        title,
        authors: typeof row.authors === 'string' ? row.authors : '',
        coverImageUrl: typeof row.coverImageUrl === 'string' ? row.coverImageUrl : '',
      }
    })
  return rows.filter((item): item is ShoppingListEntry => item !== null)
}

function parseRecommendationPickIndex(text: string): number | null {
  const numeric = text.match(/(\d+)\s*번/)
  if (numeric) return Number.parseInt(numeric[1], 10) - 1
  if (text.includes('첫')) return 0
  if (text.includes('둘') || text.includes('두')) return 1
  if (text.includes('셋') || text.includes('세')) return 2
  if (text.includes('넷') || text.includes('네')) return 3
  if (text.includes('다섯')) return 4
  return null
}

function createAssistant(text: string, attachments?: string[]): AgentMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    text,
    attachments,
    createdAt: Date.now(),
  }
}

const VALID_INTENT_TYPES: AgentIntentType[] = [
  'select_list_mode',
  'select_browse_mode',
  'search_books',
  'pause_mobility',
  'resume_mobility',
  'checkout',
  'add_book',
  'remove_book',
  'route_replan_shortest',
  'request_recommendation',
  'confirm',
  'cancel',
  'unknown',
]

function asIntentType(input: string): AgentIntentType {
  return (VALID_INTENT_TYPES as string[]).includes(input) ? (input as AgentIntentType) : 'unknown'
}


export function useChatAgent(options: {
  initialShoppingList?: ShoppingListEntry[]
  tasteSeed?: TasteSeed | null
}) {
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages)
  const messagesRef = useRef<AgentMessage[]>(messages)
  const [context, setContextState] = useState<AgentContext>(initialContextValue)
  const contextRef = useRef<AgentContext>(context)
  const [latestMapSnapshot, setLatestMapSnapshot] = useState<AgentMapSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(null)
  const intentBufferRef = useRef<AgentIntent | null>(null)
  const dwellTimerRef = useRef<number | null>(null)
  const dwellKeyRef = useRef<string | null>(null)
  const tts = useTts()
  const [pipelineTtsSpeaking, setPipelineTtsSpeaking] = useState(false)
  const [mobilityHold, setMobilityHold] = useState(false)
  const pipelineRef = useRef<AssistantOutputPipeline | null>(null)
  const ttsSpeaking = tts.speaking || pipelineTtsSpeaking
  const hasInitialShoppingList = (options.initialShoppingList?.length ?? 0) > 0
  const shouldAutoLoadShelf = !hasInitialShoppingList
  const { gateRef: existingListGateRef, updateGate: updateExistingListGate, runEditFollowUp } = useExistingListGate()
  const checkoutArrivalHandledRef = useRef(false)
  useLayoutEffect(() => {
    contextRef.current = context
  }, [context])

  useLayoutEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /**
   * Same-tick `contextRef` sync is required because `submitUserText` reads
   * `contextRef.current` immediately after a state change in async flows.
   */
  const setContext = useCallback((patch: Partial<AgentContext>) => {
    setContextState((prev) => {
      const next = { ...prev, ...patch }
      contextRef.current = next
      return next
    })
  }, [])

  useEffect(() => subscribeMapSnapshot(setLatestMapSnapshot), [])

  useEffect(() => {
    return subscribeDwellEvent((event) => {
      if (event.type === 'DWELL_BOOK_DETECTED') {
        setContext({ pendingDwellBook: event.book })
      }
    })
  }, [setContext])

  useEffect(() => {
    return subscribeDwellEvent((event) => {
      if (event.type !== 'SHELF_ARRIVED') return
      const candidates = extractRecommendationCandidates(contextRef.current.lastToolResult)
      if (candidates.length === 0) return

      const candidate = candidates[Math.abs(event.legIndex) % candidates.length]
      if (!candidate) return
      const key = `${latestMapSnapshot?.missionVersion ?? 0}:${event.legIndex}:${candidate.booksId}`
      if (dwellKeyRef.current === key) return

      if (dwellTimerRef.current !== null) window.clearTimeout(dwellTimerRef.current)
      dwellKeyRef.current = key
      dwellTimerRef.current = window.setTimeout(() => {
        const book: DwellBookCandidate = {
          ...candidate,
          detectedAt: Date.now(),
          source: 'route',
        }
        dispatchDwellEvent({ type: 'DWELL_BOOK_DETECTED', version: AGENT_MAP_EVENT_VERSION, book })
      }, 30000)
    })
  }, [latestMapSnapshot?.missionVersion])

  const {
    activeUsersId,
    appendAssistantConversationMessage,
    conversationIdRef,
    listLoadMessage,
    listLoadStatus,
    loadExistingListOnDemand,
    sessionReady,
  } = useChatAgentSession({
    contextRef,
    initialShoppingList: options.initialShoppingList,
    listType: context.listType,
    setContext,
    setMessages,
    shouldAutoLoadShelf,
  })

  const toolExecutionContext = useMemo<ToolExecutionContext>(
    () => ({
      getContext: () => contextRef.current,
      setContext,
    }),
    [setContext],
  )

  const appendAssistant = useCallback((text: string, attachments?: string[]) => {
    setMessages((prev) => [...prev, createAssistant(text, attachments)])
  }, [])

  const appendAssistantDirectRef = useRef(
    async (text: string, attachments?: string[]) => {
      appendAssistant(text, attachments)
      await appendAssistantConversationMessage(text)
    },
  )

  useLayoutEffect(() => {
    appendAssistantDirectRef.current = async (text: string, attachments?: string[]) => {
      appendAssistant(text, attachments)
      await appendAssistantConversationMessage(text)
    }
  }, [appendAssistant, appendAssistantConversationMessage])

  const pipeline = useMemo(
    () =>
      createAssistantOutputPipeline({
        appendAssistant: (text, attachments) => appendAssistantDirectRef.current(text, attachments),
        speakAndWait: tts.speakAndWait,
        isTtsEnabled: tts.isEnabled,
        onTtsSpeakingChange: setPipelineTtsSpeaking,
        onMobilityHoldChange: setMobilityHold,
      }),
    [tts.isEnabled, tts.speakAndWait],
  )

  useLayoutEffect(() => {
    pipelineRef.current = pipeline
    return () => {
      pipeline.dispose()
      pipelineRef.current = null
    }
  }, [pipeline])

  const enqueueAssistant = useCallback(
    (item: PipelineItem) => pipeline.enqueue(item),
    [pipeline],
  )

  const enqueueAssistantMany = useCallback(
    (items: PipelineItem[]) => pipeline.enqueueMany(items),
    [pipeline],
  )

  const appendAssistantAndStore = useCallback(
    async (text: string, attachments?: string[]) => {
      await enqueueAssistant({ text, attachments, gate: { kind: 'immediate' } })
    },
    [enqueueAssistant],
  )

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      checkoutArrivalHandledRef.current = false
      setMobilityHold(false)
      tts.cancel()
      pipelineRef.current?.resetNavRun()
    })
  }, [tts])

  useEffect(() => {
    if (!activeUsersId || !sessionReady || !hasInitialShoppingList) return
    if (existingListGateRef.current.status !== 'inactive') return

    const count = options.initialShoppingList?.length ?? 0
    const navPrompt = buildNavStartPrompt(count)
    if (messagesRef.current.some((message) => message.role === 'assistant' && message.text === navPrompt)) {
      return
    }

    updateExistingListGate({ status: 'awaiting_nav' })
    dispatchPreviewNavPlan(fixtureRobotDirectGoals())
    void appendAssistantDirectRef.current(navPrompt)
  }, [
    activeUsersId,
    existingListGateRef,
    hasInitialShoppingList,
    options.initialShoppingList,
    sessionReady,
    updateExistingListGate,
  ])

  useEffect(() => {
    return subscribeDwellEvent((event) => {
      if (event.type !== 'CHECKOUT_ARRIVED') return
      if (checkoutArrivalHandledRef.current) return
      const cartItems =
        contextRef.current.cartItems.length > 0
          ? contextRef.current.cartItems
          : contextRef.current.shoppingList
      if (cartItems.length === 0) return

      checkoutArrivalHandledRef.current = true
      void (async () => {
        const result = await completeCheckoutPurchase(toolExecutionContext)
        if (result.ok) {
          await enqueueAssistant({
            text: result.message,
            gate: { kind: 'on_checkout_arrived' },
          })
        } else {
          await appendAssistantAndStore(result.message)
          checkoutArrivalHandledRef.current = false
        }
      })()
    })
  }, [appendAssistantAndStore, enqueueAssistant, toolExecutionContext])

  const appendRecognitionMessage = useCallback((kind: RecognitionKind, text: string) => {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'recognition',
      text,
      recognitionKind: kind,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, message])
  }, [])

  const {
    handleBrowseCapture: handleDemoBrowseCapture,
    handleDwellFeedback: handleDemoDwellFeedback,
    handleAlternativeAccepted: handleDemoAlternativeAccepted,
    confirmDemoNavToBook,
    handleCartAddSuccess: handleDemoCartAddSuccess,
    demoStateRef,
  } = useDemoOrchestrator({
    toolExecutionContext,
    enqueueAssistant,
    enqueueAssistantMany,
    setContext,
    enabled: false,
  })

  /**
   * Shared post-execute pipeline used by both the `confirm` flow and the
   * regular intent flow: telemetry → context patch (incl. transitioned state)
   * → assistant message → fallbackTool on failure.
   */
  const runToolWithFallback = useToolRunner({
    toolExecutionContext,
    contextRef,
    setContext,
    appendAssistantAndStore,
    runEditFollowUp,
    onCartAddSuccess: async () => {
      if (!isDemoMode()) return
      const cart = contextRef.current.cartItems
      const last = cart[cart.length - 1]
      if (last?.title) await handleDemoCartAddSuccess(last.title)
    },
  })

  const handleCancelIntent = useCallback(async () => {
    const pending = contextRef.current.pendingConfirmation
    if (!pending) {
      await appendAssistantAndStore('취소할 확인 대기가 없어요.')
      recordIntentOutcome('cancel', true)
      return
    }
    setContext({ pendingConfirmation: null })
    await appendAssistantAndStore('요청을 취소했어요.')
    recordIntentOutcome('cancel', true)
  }, [appendAssistantAndStore, setContext])

  const handleConfirmIntent = useCallback(async () => {
    const pending = contextRef.current.pendingConfirmation
    if (!pending) {
      await appendAssistantAndStore('확인할 작업이 없어요.')
      recordIntentOutcome('confirm', false)
      return
    }
    await runToolWithFallback(
      { name: pending.toolName, args: pending.args },
      'confirm',
      { pendingConfirmation: null },
    )
  }, [appendAssistantAndStore, runToolWithFallback])

  const actionCard = null

  const submitUserText = useCallback(
    async (text: string, source: AgentIntentSource = 'chat') => {
      const normalized = text.replace(/\r\n/g, '\n')
      const intentText = normalized.trim()
      if (!intentText) return

      setBusy(true)
      setLastFailedUserText(null)
      try {
        if (
          existingListGateRef.current.status === 'awaiting' &&
          !contextRef.current.pendingConfirmation &&
          isProceedToken(intentText)
        ) {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'confirm',
            setMessages,
          })
          updateExistingListGate({ status: 'awaiting_nav' })
          dispatchPreviewNavPlan(fixtureRobotDirectGoals())
          await appendAssistantAndStore(
            '리스트를 확정했어요. 안내를 시작할까요? "진행" 또는 "오케이"라고 답해 주세요.',
          )
          return
        }

        const cartForNav =
          contextRef.current.cartItems.length > 0
            ? contextRef.current.cartItems
            : contextRef.current.shoppingList
        const canStartNavigationFromProceed =
          !contextRef.current.pendingConfirmation &&
          isProceedToken(intentText) &&
          existingListGateRef.current.status !== 'nav_started' &&
          cartForNav.length > 0 &&
          (existingListGateRef.current.status === 'awaiting_nav' ||
            existingListGateRef.current.status === 'inactive' ||
            existingListGateRef.current.status === 'confirmed')

        if (canStartNavigationFromProceed) {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'confirm',
            setMessages,
          })
          updateExistingListGate({ status: 'nav_started' })
          dispatchSetDirectGoals(fixtureRobotDirectGoals())
          dispatchStartNavigation()
          void enqueueAssistant({
            text: '안내를 시작할게요.',
            gate: { kind: 'after_nav_ready' },
          })
          return
        }

        if (contextRef.current.pendingConfirmation) {
          const pendingReply = resolvePendingConfirmationReply(intentText)
          if (pendingReply === 'confirm') {
            await appendUserMessageAndStore({
              text: normalized,
              conversationId: conversationIdRef.current,
              intent: 'confirm',
              setMessages,
            })
            setContext({
              state: transitionStateFromIntent(contextRef.current.state, 'confirm'),
            })
            await handleConfirmIntent()
            return
          }
          if (pendingReply === 'cancel') {
            await appendUserMessageAndStore({
              text: normalized,
              conversationId: conversationIdRef.current,
              intent: 'cancel',
              setMessages,
            })
            setContext({
              state: transitionStateFromIntent(contextRef.current.state, 'cancel'),
            })
            await handleCancelIntent()
            return
          }
        }

        if (contextRef.current.awaitingDwellFeedback && contextRef.current.pendingDwellBook) {
          const dwellBook = contextRef.current.pendingDwellBook
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'request_recommendation',
            setMessages,
          })
          if (isDemoMode()) {
            const handled = await handleDemoDwellFeedback(intentText, dwellBook)
            if (handled) return
          }
          setContext({ awaitingDwellFeedback: false })
          await runToolWithFallback(
            {
              name: 'recommendationTool',
              args: {
                mode: 'book_alternative',
                seedBookId: dwellBook.booksId,
                negativeReason: intentText,
              },
            },
            'request_recommendation',
            { pendingDwellBook: null },
          )
          return
        }

        if (isDemoMode()) {
          if (
            demoStateRef.current.step === 'awaiting_nav_confirm' &&
            demoStateRef.current.awaitingNavConfirm != null &&
            isProceedToken(intentText)
          ) {
            await appendUserMessageAndStore({
              text: normalized,
              conversationId: conversationIdRef.current,
              intent: 'confirm',
              setMessages,
            })
            await confirmDemoNavToBook(demoStateRef.current.awaitingNavConfirm ?? [])
            return
          }
          if (
            demoStateRef.current.step === 'alternative_recommend' &&
            /(함께|두 권|안내|가자|보러)/.test(intentText)
          ) {
            await appendUserMessageAndStore({
              text: normalized,
              conversationId: conversationIdRef.current,
              intent: 'resume_mobility',
              setMessages,
            })
            await handleDemoAlternativeAccepted()
            return
          }
        }

        const llmPlan = await planWithLlm({
          text: intentText,
          source,
          context: contextRef.current,
          history: messagesRef.current,
        })
        const parsedIntent = parseUserIntent(intentText, source)
        const llmIntentType = llmPlan ? asIntentType(llmPlan.intentType) : 'unknown'
        const hasUsableLlmIntent = llmPlan !== null && llmIntentType !== 'unknown'
        const nextIntent = mergePlannerIntentWithRules({
          ruleIntent: parsedIntent,
          llmPlan,
          rawTextForLlm: text,
          source,
          llmIntentType,
          hasUsableLlmIntent,
        })
        if (
          hasUsableLlmIntent &&
          isListEditIntentType(parsedIntent.type) &&
          llmIntentType !== parsedIntent.type
        ) {
          incrementMetric('listEditRuleOverridesLlm')
        }
        if (hasUsableLlmIntent) incrementMetric('llmPlannerUsed')
        else incrementMetric('llmPlannerFallback')
        const mergedIntent = intentBufferRef.current
          ? chooseHigherPriorityIntent(intentBufferRef.current, nextIntent)
          : nextIntent
        intentBufferRef.current = null

        await appendUserMessageAndStore({
          text: normalized,
          conversationId: conversationIdRef.current,
          intent: mergedIntent.type,
          setMessages,
        })

        setContext({
          state: transitionStateFromIntent(contextRef.current.state, mergedIntent.type),
        })

        if (mergedIntent.type === 'cancel') {
          await handleCancelIntent()
          return
        }

        if (mergedIntent.type === 'confirm') {
          await handleConfirmIntent()
          return
        }

        if (mergedIntent.type === 'resume_mobility') {
          const dwellBook = contextRef.current.pendingDwellBook
          const cart = contextRef.current.cartItems.length > 0 ? contextRef.current.cartItems : contextRef.current.shoppingList
          const isInCart = dwellBook ? cart.some((item) => item.booksId === dwellBook.booksId) : false
          if (dwellBook && !isInCart) {
            setContext({ awaitingDwellFeedback: true, mobilityPaused: true })
            await appendAssistantAndStore(
              `"${dwellBook.title}"을 30초 정도 보셨는데 장바구니에는 담지 않으셨네요. 어떤 점이 마음에 안 들었는지 말해주시면 그 책 기준으로 더 맞는 대안을 추천해드릴게요.`,
            )
            return
          }
        }

        if (mergedIntent.type === 'select_browse_mode') {
          setContext({ listType: '쇼핑리스트' })
          await appendAssistantAndStore(
            '계획 없이 바로 출발합니다. 화면에 보이는 추천이나 제가 말해드리는 추천에 집중해 주세요. 필요하면 "추천해줘"라고 말해 주세요. 마음에 들면 쇼핑리스트에 담을 수 있어요.',
          )
          recordIntentOutcome('select_browse_mode', true)
          return
        }

        const deterministicToolCall = toolCallForIntent(mergedIntent)
        const plannedToolCall = mergedIntent.type === 'unknown' ? null : (llmPlan?.toolCall ?? null)
        let toolCall = mergePlannedToolCall(deterministicToolCall, plannedToolCall, mergedIntent.type)
        if (mergedIntent.type === 'add_book' && toolCall?.name === 'shoppingListTool') {
          const index = parseRecommendationPickIndex(intentText)
          if (index != null) {
            const titles = extractRecommendationTitles(contextRef.current.lastToolResult)
            const title = titles[index]
            if (title) {
              toolCall = {
                ...toolCall,
                args: { ...toolCall.args, hint: `책 추가 ${title}` },
              }
            }
          }
        }
        if (!toolCall) {
          if (mergedIntent.type === 'unknown') {
            const unknownReply = await resolveUnknownChatReply({
              text: intentText,
              llmPlan,
              context: contextRef.current,
              history: messagesRef.current,
            })
            if (unknownReply.kind === 'off_topic') incrementMetric('chatOffTopicReply')
            else if (unknownReply.usedLlm) incrementMetric('chatConversationalLlmUsed')
            else incrementMetric('chatConversationalLlmFallback')
            await appendAssistantAndStore(unknownReply.text)
            recordIntentOutcome('unknown', unknownReply.kind === 'conversational')
            return
          }
          await appendAssistantAndStore('현재 이 요청은 아직 연결되지 않았어요.')
          recordIntentOutcome(mergedIntent.type, false)
          return
        }

        if (requiresConfirmation(mergedIntent)) {
          incrementMetric('reconfirmRequested')
          let summary = `${mergedIntent.rawText} 요청을 실행할까요? 확인 버튼을 누르거나 "오케이"라고 입력하면 진행합니다.`
          if (mergedIntent.type === 'remove_book' && toolCall.name === 'shoppingListTool') {
            const rawHint = typeof toolCall.args.hint === 'string' ? toolCall.args.hint : mergedIntent.rawText
            const interpretedTitle = normalizeListHint(rawHint, 'remove')
            if (interpretedTitle) {
              summary = `"${interpretedTitle}" 삭제 요청을 실행할까요? 확인 버튼을 누르거나 "오케이"라고 입력하면 진행합니다.`
            }
          }
          setContext({
            pendingConfirmation: {
              toolName: toolCall.name,
              args: toolCall.args,
              summary,
            },
          })
          await appendAssistantAndStore(summary.replace('확인 버튼을 누르거나 "오케이"라고 입력하면 진행합니다.', '카드에서 확인하거나 오케이라고 입력해 주세요.'))
          return
        }

        if (mergedIntent.type === 'pause_mobility' || mergedIntent.type === 'resume_mobility') {
          incrementMetric('interruptHandled')
        }

        let result = await runToolWithFallback(toolCall, mergedIntent.type)
        if (
          !result.ok &&
          result.errorCode === 'VALIDATION_ERROR' &&
          deterministicToolCall &&
          (deterministicToolCall.name !== toolCall.name ||
            JSON.stringify(deterministicToolCall.args) !== JSON.stringify(toolCall.args))
        ) {
          result = await runToolWithFallback(deterministicToolCall, mergedIntent.type)
        }

        if (!result.ok) {
          setLastFailedUserText(normalized)
        }

        /**
         * Behavior preserved: this reads `contextRef.current.state` *after*
         * `runToolWithFallback` has already transitioned it, matching the
         * pre-refactor semantics (sessionCompleted fires when the
         * post-transition state is GOAL_CHECK and the tool succeeded).
         */
        if (contextRef.current.state === 'GOAL_CHECK' && result.ok) {
          incrementMetric('sessionCompleted')
        }
      } finally {
        setBusy(false)
      }
    },
    [
      appendAssistantAndStore,
      enqueueAssistant,
      handleCancelIntent,
      handleConfirmIntent,
      conversationIdRef,
      runToolWithFallback,
      setContext,
      existingListGateRef,
      updateExistingListGate,
      demoStateRef,
      handleDemoAlternativeAccepted,
      handleDemoDwellFeedback,
      confirmDemoNavToBook,
    ],
  )

  const acceptConfirmation = useCallback(() => {
    void submitUserText(CHAT_AGENT_MESSAGES.confirmInput, 'chat')
  }, [submitUserText])

  const cancelConfirmation = useCallback(() => {
    void submitUserText(CHAT_AGENT_MESSAGES.cancelInput, 'chat')
  }, [submitUserText])

  const retryLastFailed = useCallback(() => {
    if (!lastFailedUserText) return
    void submitUserText(lastFailedUserText, 'chat')
  }, [lastFailedUserText, submitUserText])

  /** Multimodal / alternate source (W18). */
  const submitAgentInput = useCallback(
    (text: string, source: AgentIntentSource) => {
      void submitUserText(text, source)
    },
    [submitUserText],
  )

  const applyBookRecognitionCapture = useCallback(
    async (
      reason: 'add' | 'remove' | 'browse',
      imageBase64: string,
      trigger: 'gesture' | 'ui' = 'ui',
    ) => {
      if (!imageBase64.trim()) return
      if (reason === 'browse') {
        setBusy(true)
        try {
          await appendUserMessageAndStore({
            text: '[표지 인식 · 구경]',
            conversationId: conversationIdRef.current,
            intent: 'unknown',
            setMessages,
          })
          await handleDemoBrowseCapture(imageBase64)
        } finally {
          setBusy(false)
        }
        return
      }
      setBusy(true)
      setLastFailedUserText(null)
      try {
        const label =
          trigger === 'gesture'
            ? reason === 'add'
              ? '제스처 · 담기'
              : '제스처 · 빼기'
            : reason === 'add'
              ? '표지 인식 · 담기'
              : '표지 인식 · 빼기'
        await appendUserMessageAndStore({
          text: `[${label}]`,
          conversationId: conversationIdRef.current,
          intent: reason === 'add' ? 'add_book' : 'remove_book',
          setMessages,
        })
        const intentType = reason === 'add' ? 'add_book' : 'remove_book'
        const result = await runToolWithFallback(
          { name: 'shoppingListTool', args: { action: reason, imageBase64, source: trigger } },
          intentType,
        )
        if (!result.ok) {
          setLastFailedUserText(`[${label}]`)
        }
      } finally {
        setBusy(false)
      }
    },
    [conversationIdRef, handleDemoBrowseCapture, runToolWithFallback, setMessages],
  )

  const applyBookBrowseCapture = useCallback(
    async (imageBase64: string) => {
      await applyBookRecognitionCapture('browse', imageBase64)
    },
    [applyBookRecognitionCapture],
  )

  return {
    messages,
    submitUserText,
    submitAgentInput,
    appendRecognitionMessage,
    applyBookRecognitionCapture,
    applyBookBrowseCapture,
    context,
    latestMapSnapshot,
    telemetry: getTelemetrySnapshot(),
    busy,
    lastFailedUserText,
    acceptConfirmation,
    cancelConfirmation,
    retryLastFailed,
    listLoadStatus,
    listLoadMessage,
    loadExistingListOnDemand,
    actionCard,
    tts,
    ttsSpeaking,
    mobilityHold,
  }
}
