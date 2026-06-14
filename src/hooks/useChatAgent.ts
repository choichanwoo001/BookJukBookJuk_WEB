import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { publishVersoResume } from '../lib/verso/versoMobilityCommands'
import {
  parseUserIntent,
  toolCallForIntent,
} from '../agent/runtime/chatAgentRuntime'
import {
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
  dispatchMapCommand,
  dispatchSetDirectGoals,
  dispatchPreviewNavPlan,
  dispatchStartNavigation,
  subscribeDwellEvent,
  subscribeMapCommand,
  subscribeMapSnapshot,
  dispatchMobilityHold,
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
import { buildNavStartPrompt, CHAT_AGENT_MESSAGES, NAV_START_CONFIRM_PROMPT } from './chatAgent/messages'
import { resolveUnknownChatReply } from './chatAgent/resolveUnknownChatReply'
import { isDemoMode } from '../config/demoMode'
import type { TasteSeed } from '../types/onboarding'
import { useFixtureShelfArrivalBrief } from './useFixtureShelfArrivalBrief'
import {
  extendedFixtureRobotDirectGoals,
  fixtureRobotDirectGoals,
  SERENDIPITY_BROWSE_POOL_INDEX,
} from '../data/fixtureRobotRoute'
import { DEMO_DWELL_BOOK, DEMO_RECOMMENDED_BOOK } from '../data/demoScenario'
import { useToolRunner } from './chatAgent/useToolRunner'
import { useChatAgentSession } from './chatAgent/useChatAgentSession'
import { completeCheckoutPurchase } from '../agent/tools/checkoutCompletion'
import { checkoutTool } from '../agent/tools/checkoutTool'
import { useTransitSerendipityDetour } from './useTransitSerendipityDetour'

const initialContextValue = (): AgentContext => ({
  state: 'INIT',
  mobilityPaused: false,
  listType: '쇼핑리스트',
  activeUsersId: undefined,
  shoppingList: [],
  cartItems: [],
  pendingDwellBook: null,
  awaitingDwellFeedback: false,
  skippedDwellBook: null,
  extendedRouteActive: false,
  transitDetourPhase: 'idle',
  resumeLegAfterDetour: null,
  checkoutStatus: 'idle',
  receipt: null,
  kakaoPaySession: null,
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
  'select_browse_mode',
  'search_books',
  'pause_mobility',
  'resume_mobility',
  'follow_robot',
  'lead_robot',
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
  const dwellTimerRef = useRef<number | null>(null)
  const dwellKeyRef = useRef<string | null>(null)
  const tts = useTts()
  const [pipelineTtsSpeaking, setPipelineTtsSpeaking] = useState(false)
  const [mobilityHold, setMobilityHold] = useState(false)
  const applyMobilityHold = useCallback((held: boolean) => {
    dispatchMobilityHold(held)
    setMobilityHold(held)
  }, [])
  const pipelineRef = useRef<AssistantOutputPipeline | null>(null)
  const ttsSpeaking = tts.speaking || pipelineTtsSpeaking
  const hasInitialShoppingList = (options.initialShoppingList?.length ?? 0) > 0
  const shouldAutoLoadShelf = !hasInitialShoppingList
  const { gateRef: existingListGateRef, updateGate: updateExistingListGate } = useExistingListGate()
  const checkoutArrivalHandledRef = useRef(false)
  const kakaoConfirmInFlightRef = useRef(false)
  const navStartPromptShownRef = useRef(false)
  const sessionReadyRef = useRef(false)
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

      // browse 스톱(단 한 사람)에 도착하면 타이머 없이 즉시 dwell 감지.
      // extendedRouteActive이면 이미 경로 확장이 완료된 상태이므로 재감지 건너뜀.
      if (
        event.poolIndex === SERENDIPITY_BROWSE_POOL_INDEX &&
        !contextRef.current.extendedRouteActive
      ) {
        if (dwellTimerRef.current !== null) window.clearTimeout(dwellTimerRef.current)
        const book: DwellBookCandidate = {
          booksId: DEMO_DWELL_BOOK.booksId,
          title: DEMO_DWELL_BOOK.title,
          authors: DEMO_DWELL_BOOK.authors,
          detectedAt: Date.now(),
          source: 'route',
        }
        dispatchDwellEvent({ type: 'DWELL_BOOK_DETECTED', version: AGENT_MAP_EVENT_VERSION, book })
        return
      }

      // 일반 스톱: 이전 추천 결과의 후보를 30초 후 dwell 감지 (기존 로직).
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
    sessionReady,
  } = useChatAgentSession({
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
        onMobilityHoldChange: applyMobilityHold,
        onResumeMobility: () => {
          publishVersoResume()
        },
      }),
    [tts.isEnabled, tts.speakAndWait, applyMobilityHold],
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

  const resolveNavStartBookCount = useCallback(() => {
    const cartCount = contextRef.current.cartItems.length
    if (cartCount > 0) return cartCount
    const listCount = contextRef.current.shoppingList.length
    if (listCount > 0) return listCount
    return options.initialShoppingList?.length ?? 0
  }, [options.initialShoppingList])

  useLayoutEffect(() => {
    sessionReadyRef.current = sessionReady
  }, [sessionReady])

  const ensureNavStartPromptShown = useCallback(async () => {
    if (!sessionReadyRef.current || !activeUsersId) return
    const navPrompt = buildNavStartPrompt(resolveNavStartBookCount())
    if (navStartPromptShownRef.current) return
    if (messagesRef.current.some((message) => message.role === 'assistant' && message.text === navPrompt)) {
      navStartPromptShownRef.current = true
      return
    }
    if (existingListGateRef.current.status === 'inactive') {
      updateExistingListGate({ status: 'awaiting_nav' })
    }
    await appendAssistantAndStore(navPrompt)
    navStartPromptShownRef.current = true
  }, [activeUsersId, appendAssistantAndStore, existingListGateRef, resolveNavStartBookCount, updateExistingListGate])

  const { handleFollowMeDetour, trackMapSnapshot } = useTransitSerendipityDetour({
    contextRef,
    setContext,
    appendAssistant: appendAssistantAndStore,
  })

  useEffect(() => {
    trackMapSnapshot(latestMapSnapshot)
  }, [latestMapSnapshot, trackMapSnapshot])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      checkoutArrivalHandledRef.current = false
      applyMobilityHold(false)
      tts.cancel()
      pipelineRef.current?.resetNavRun()
    })
  }, [tts])

  useEffect(() => {
    if (!activeUsersId || !sessionReady) return
    if (resolveNavStartBookCount() === 0) return
    if (existingListGateRef.current.status === 'nav_started') return
    if (hasInitialShoppingList || isDemoMode()) {
      dispatchPreviewNavPlan(fixtureRobotDirectGoals())
    }
    void ensureNavStartPromptShown()
  }, [
    activeUsersId,
    ensureNavStartPromptShown,
    existingListGateRef,
    hasInitialShoppingList,
    resolveNavStartBookCount,
    sessionReady,
  ])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'PREVIEW_NAV_PLAN') return
      if (!sessionReadyRef.current) return
      void ensureNavStartPromptShown()
    })
  }, [ensureNavStartPromptShown])

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

  useFixtureShelfArrivalBrief({ enqueueAssistantMany })

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
  })

  const applyExtendedRouteAfterReco = useCallback(async () => {
    const skippedBook = contextRef.current.skippedDwellBook
    if (!skippedBook) return

    const candidates = extractRecommendationCandidates(contextRef.current.lastToolResult)
    const recoBook = candidates[0] ?? DEMO_RECOMMENDED_BOOK

    await runToolWithFallback(
      { name: 'shoppingListTool', args: { action: 'add', hint: `책 추가 ${skippedBook.title}` } },
      'add_book',
    )
    await runToolWithFallback(
      { name: 'shoppingListTool', args: { action: 'add', hint: `책 추가 ${recoBook.title}` } },
      'add_book',
    )

    setContext({
      skippedDwellBook: null,
      extendedRouteActive: true,
      mobilityPaused: false,
      transitDetourPhase: 'idle',
      resumeLegAfterDetour: null,
    })
    dispatchSetDirectGoals(extendedFixtureRobotDirectGoals())
    dispatchMapCommand({ type: 'RESUME_MOBILITY', version: AGENT_MAP_EVENT_VERSION })
    await appendAssistantAndStore(
      `"${skippedBook.title}"과 "${recoBook.title}"을 경로에 추가했어요. 순서대로 안내할게요!`,
    )
  }, [appendAssistantAndStore, runToolWithFallback, setContext])

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

  const submitUserText = useCallback(
    async (text: string, source: AgentIntentSource = 'chat') => {
      const normalized = text.replace(/\r\n/g, '\n')
      const intentText = normalized.trim()
      if (!intentText) return

      setBusy(true)
      setLastFailedUserText(null)
      try {
        if (
          existingListGateRef.current.status === 'awaiting_nav' &&
          !contextRef.current.pendingConfirmation &&
          isProceedToken(intentText)
        ) {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'confirm',
            setMessages,
          })
          updateExistingListGate({ status: 'awaiting_nav_confirm' })
          await appendAssistantAndStore(NAV_START_CONFIRM_PROMPT)
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
          existingListGateRef.current.status === 'awaiting_nav_confirm'

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
            gate: { kind: 'immediate' },
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

          if (
            isDemoMode() &&
            contextRef.current.transitDetourPhase === 'serendipity_dwell'
          ) {
            const recoBook = DEMO_RECOMMENDED_BOOK
            const recoResult: ToolResult = {
              ok: true,
              toolName: 'recommendationTool',
              message: `"${recoBook.title}"을 추천드려요.`,
              data: {
                recommendations: [`보완 추천 1. ${recoBook.title} - ${recoBook.authors}`],
                source: 'demo_transit_detour',
                candidates: [{
                  booksId: recoBook.booksId,
                  title: recoBook.title,
                  authors: recoBook.authors,
                }],
              },
            }
            setContext({
              awaitingDwellFeedback: false,
              skippedDwellBook: dwellBook,
              pendingDwellBook: null,
              transitDetourPhase: 'await_reco_accept',
              lastToolResult: recoResult,
            })
            await appendAssistantAndStore(
              `"${intentText}"을 반영해 "${recoBook.title}"을 추천드려요. 괜찮으시면 "오케이"라고 말씀해 주세요.`,
              [`보완 추천 1. ${recoBook.title} - ${recoBook.authors}`],
            )
            return
          }

          // skippedDwellBook에 보존: 추천 결과 후 "경로에 추가" 요청 시 함께 추가하기 위함.
          setContext({ awaitingDwellFeedback: false, skippedDwellBook: dwellBook })
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

        // transit detour: dwell 피드백 후 "오케이"로 확장 경로 수락
        if (
          contextRef.current.transitDetourPhase === 'await_reco_accept' &&
          isProceedToken(intentText) &&
          contextRef.current.skippedDwellBook &&
          contextRef.current.lastToolResult?.toolName === 'recommendationTool'
        ) {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'confirm',
            setMessages,
          })
          await applyExtendedRouteAfterReco()
          return
        }

        // 경로 확장 제스처: dwell 피드백 후 추천이 표시된 상태에서 "경로/같이/함께" 발화 시
        // skippedDwellBook(단 한 사람) + 추천 1번(어른이 된다는 것)을 함께 추가하고 확장 경로로 전환.
        if (
          contextRef.current.skippedDwellBook &&
          !contextRef.current.extendedRouteActive &&
          contextRef.current.lastToolResult?.toolName === 'recommendationTool' &&
          /(경로|같이|함께|두\s*(권|책))/.test(intentText)
        ) {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'add_book',
            setMessages,
          })
          await applyExtendedRouteAfterReco()
          return
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
        const mergedIntent = nextIntent

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
              `"${dwellBook.title}"에 관심을 보이셨는데 장바구니에 담지 않으셨네요. 어떤 점이 마음에 걸리셨는지 말씀해 주시면 그 책 기준으로 더 잘 맞는 책을 추천해드릴게요.`,
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
      applyExtendedRouteAfterReco,
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

  const applyBookGestureDecision = useCallback(
    async (reason: 'add' | 'remove', book: { title: string; author?: string }) => {
      setBusy(true)
      setLastFailedUserText(null)
      try {
        const label = reason === 'add' ? '제스처 · 담기' : '제스처 · 빼기'
        await appendUserMessageAndStore({
          text: `[${label}] ${book.title}`,
          conversationId: conversationIdRef.current,
          intent: reason === 'add' ? 'add_book' : 'remove_book',
          setMessages,
        })
        const intentType = reason === 'add' ? 'add_book' : 'remove_book'
        const verb = reason === 'add' ? '추가' : '삭제'
        const result = await runToolWithFallback(
          {
            name: 'shoppingListTool',
            args: { action: reason, hint: `책 ${verb} ${book.title}`, source: 'gesture' },
          },
          intentType,
        )
        if (!result.ok) {
          setLastFailedUserText(`[${label}] ${book.title}`)
        }
      } finally {
        setBusy(false)
      }
    },
    [conversationIdRef, runToolWithFallback, setMessages],
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
    [conversationIdRef, runToolWithFallback, setMessages],
  )

  const applyBookBrowseCapture = useCallback(
    async (imageBase64: string) => {
      await applyBookRecognitionCapture('browse', imageBase64)
    },
    [applyBookRecognitionCapture],
  )

  const startKakaoPayCheckout = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await checkoutTool.run({}, toolExecutionContext)
      await appendAssistantAndStore(result.message)
    } finally {
      setBusy(false)
    }
  }, [appendAssistantAndStore, busy, toolExecutionContext])

  const confirmKakaoPayCheckout = useCallback(async () => {
    if (!contextRef.current.kakaoPaySession) return
    if (contextRef.current.checkoutStatus === 'completed') return
    if (kakaoConfirmInFlightRef.current) return
    kakaoConfirmInFlightRef.current = true
    try {
      const result = await completeCheckoutPurchase(toolExecutionContext, { preferLocalFirst: true })
      await appendAssistantAndStore(result.message)
    } finally {
      kakaoConfirmInFlightRef.current = false
    }
  }, [appendAssistantAndStore, toolExecutionContext])

  const cancelKakaoPayCheckout = useCallback(() => {
    setContext({ kakaoPaySession: null, checkoutStatus: 'idle' })
  }, [setContext])

  return {
    messages,
    submitUserText,
    submitAgentInput,
    appendRecognitionMessage,
    applyBookRecognitionCapture,
    applyBookGestureDecision,
    applyBookBrowseCapture,
    handleFollowMeDetour,
    startKakaoPayCheckout,
    confirmKakaoPayCheckout,
    cancelKakaoPayCheckout,
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
    tts,
    ttsSpeaking,
    mobilityHold,
  }
}
