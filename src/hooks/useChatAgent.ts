import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseUserIntent,
  recommendationAttachmentsFromResult,
  toolCallForIntent,
} from '../agent/runtime/chatAgentRuntime'
import {
  chooseHigherPriorityIntent,
  isListEditIntentType,
  mergePlannerIntentWithRules,
  requiresConfirmation,
} from '../agent/policy'
import { transitionStateFromIntent, transitionStateFromTool } from '../agent/stateMachine'
import {
  getTelemetrySnapshot,
  incrementMetric,
  recordBridgeErrorCode,
  recordIntentOutcome,
  recordThemeLlmLatency,
  recordToolLatency,
} from '../agent/telemetry'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  subscribeDwellEvent,
  subscribeMapSnapshot,
  type AgentMapSnapshot,
} from '../agent/runtime/agentEventBus'
import { planWithLlm } from '../agent/runtime/llmPlanner'
import { rewriteAssistantMessage } from '../agent/runtime/llmRewriter'
import { generateThemesWithLlm } from '../agent/runtime/llmThemeGenerator'
import { executeTool } from '../agent/tools/registry'
import { normalizeListHint } from '../agent/listHintNormalize'
import { getDefaultUserId } from '../lib/supabase/env'
import { getCurrentWebSessionUsersId } from '../lib/supabase/qrLogin'
import {
  appendConversationMessage,
  createConversation,
} from '../lib/supabase/conversation'
import { shelfListLoadUserMessage } from '../lib/supabase/listLoadUi'
import { loadShelfBooks, mapListTypeToShelfType } from '../lib/supabase/shelves'
import type { StartMode } from '../types/startMode'
import type {
  AgentContext,
  AgentIntent,
  AgentIntentType,
  AgentIntentSource,
  AgentMessage,
  DwellBookCandidate,
  ShoppingListEntry,
  ToolCall,
  ToolExecutionContext,
  ToolResult,
} from '../agent/types'
import { appendUserMessageAndStore } from './chatAgent/helpers'
import { mergePlannedToolCall } from './chatAgent/toolCallMerge'
import {
  buildThemeOptions,
  handleBuildFlowInput,
  initialBuildFlowSession,
  rankThemeCandidates,
  STEP1_Q1,
} from './chatAgent/buildFlow'
import type { BuildFlowSession, RecommendationCandidate, ThemeOption } from './chatAgent/buildFlow'
import { useExistingListGate } from './chatAgent/useExistingListGate'
import { isProceedToken } from './chatAgent/proceedToken'
import { resolvePendingConfirmationReply } from './chatAgent/pendingConfirmationReply'
import { isRedundantFallbackAssistantText } from './chatAgent/assistantMessageDedupe'
import { buildChatActionCard } from './chatAgent/actionCard'
import { RECENT_RECOMMENDED_CAP, recommendationContextPatch } from './chatAgent/recommendationContext'
import { CHAT_AGENT_MESSAGES } from './chatAgent/messages'

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

function toContextShoppingList(items: { booksId: string; title: string; authors: string; coverImageUrl: string }[]) {
  return items.map((b) => ({
    booksId: b.booksId,
    title: b.title,
    authors: b.authors,
    coverImageUrl: b.coverImageUrl,
  }))
}

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


export function useChatAgent(options: { startMode: StartMode; initialShoppingList?: ShoppingListEntry[] }) {
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages)
  const messagesRef = useRef<AgentMessage[]>(messages)
  const [context, setContextState] = useState<AgentContext>(initialContextValue)
  const contextRef = useRef<AgentContext>(context)
  const [latestMapSnapshot, setLatestMapSnapshot] = useState<AgentMapSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(null)
  const intentBufferRef = useRef<AgentIntent | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const dwellTimerRef = useRef<number | null>(null)
  const dwellKeyRef = useRef<string | null>(null)
  const [listLoadStatus, setListLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [listLoadMessage, setListLoadMessage] = useState<string | null>(null)
  const [activeUsersId, setActiveUsersId] = useState<string | null>(null)
  const [conversationReady, setConversationReady] = useState(false)
  const [hasAppliedStartMode, setHasAppliedStartMode] = useState(false)
  const appliedStartModeKeyRef = useRef<string | null>(null)
  const [buildFlow, setBuildFlow] = useState<BuildFlowSession>(initialBuildFlowSession)
  const shouldAutoLoadShelf = options.startMode === 'existing_list'
  const { gateRef: existingListGateRef, updateGate: updateExistingListGate, runEditFollowUp } = useExistingListGate()

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
    const activeLeg = latestMapSnapshot?.activeLeg
    const candidates = extractRecommendationCandidates(context.lastToolResult)
    if (activeLeg === null || activeLeg === undefined || candidates.length === 0) {
      if (dwellTimerRef.current !== null) window.clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = null
      dwellKeyRef.current = null
      return
    }

    const candidate = candidates[Math.abs(activeLeg) % candidates.length]
    if (!candidate) return
    const key = `${latestMapSnapshot?.missionVersion ?? 0}:${activeLeg}:${candidate.booksId}`
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

    return () => {
      if (dwellTimerRef.current !== null) window.clearTimeout(dwellTimerRef.current)
    }
  }, [context.lastToolResult, latestMapSnapshot])

  useEffect(() => {
    let disposed = false
    const bootstrapSessionUser = async () => {
      const sessionResult = await getCurrentWebSessionUsersId()
      if (disposed) return
      if (sessionResult.ok && sessionResult.data) {
        setActiveUsersId(sessionResult.data)
        setContext({ activeUsersId: sessionResult.data })
        return
      }
      const fallbackUserId = getDefaultUserId()
      setActiveUsersId(fallbackUserId)
      setContext({ activeUsersId: fallbackUserId })
    }
    void bootstrapSessionUser()
    return () => {
      disposed = true
    }
  }, [setContext])

  useEffect(() => {
    if (!activeUsersId) return
    let disposed = false
    const initializeConversation = async () => {
      setConversationReady(false)
      setHasAppliedStartMode(false)
      appliedStartModeKeyRef.current = null
      setMessages(initialMessages)
      const conversationId = await createConversation(activeUsersId)
      if (!conversationId || disposed) return
      conversationIdRef.current = conversationId
      setConversationReady(true)
    }
    void initializeConversation()
    return () => {
      disposed = true
      conversationIdRef.current = null
      setConversationReady(false)
    }
  }, [activeUsersId, options.startMode])

  useEffect(() => {
    if (!activeUsersId || shouldAutoLoadShelf) return
    if (options.initialShoppingList && options.initialShoppingList.length > 0) {
      setContext({ shoppingList: options.initialShoppingList, cartItems: options.initialShoppingList })
    }
    setListLoadStatus('ok')
    setListLoadMessage(null)
  }, [activeUsersId, options.initialShoppingList, setContext, shouldAutoLoadShelf])

  useEffect(() => {
    if (!activeUsersId || !shouldAutoLoadShelf) return
    let disposed = false
    setListLoadStatus('loading')
    setListLoadMessage(null)
    const loadList = async () => {
      const shelfType = mapListTypeToShelfType(context.listType)
      const res = await loadShelfBooks(activeUsersId, shelfType)
      if (disposed) return
      if (!res.ok) {
        setListLoadStatus('error')
        setListLoadMessage(shelfListLoadUserMessage(res.errorCode, res.message))
        return
      }
      const loaded = toContextShoppingList(res.data)
      setContext({ shoppingList: loaded, cartItems: loaded })
      setListLoadStatus('ok')
      setListLoadMessage(null)
    }
    void loadList()
    return () => {
      disposed = true
    }
  }, [activeUsersId, context.listType, setContext, shouldAutoLoadShelf])

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

  const appendAssistantAndStore = useCallback(async (text: string, attachments?: string[]) => {
    appendAssistant(text, attachments)
    if (conversationIdRef.current) {
      await appendConversationMessage({
        conversationId: conversationIdRef.current,
        role: 'assistant',
        content: text,
      })
    }
  }, [appendAssistant])

  const loadExistingListOnDemand = useCallback(async () => {
    if (!activeUsersId) return false
    setListLoadStatus('loading')
    setListLoadMessage(null)
    const shelfType = mapListTypeToShelfType(contextRef.current.listType)
    const res = await loadShelfBooks(activeUsersId, shelfType)
    if (!res.ok) {
      setListLoadStatus('error')
      setListLoadMessage(shelfListLoadUserMessage(res.errorCode, res.message))
      return false
    }
    const loaded = toContextShoppingList(res.data)
    setContext({ shoppingList: loaded, cartItems: loaded })
    setListLoadStatus('ok')
    setListLoadMessage(null)
    return true
  }, [activeUsersId, setContext])

  useEffect(() => {
    if (!activeUsersId || !conversationReady || hasAppliedStartMode) return
    const run = async () => {
      const conversationId = conversationIdRef.current
      if (!conversationId) return
      const appliedKey = `${conversationId}:${options.startMode}`
      if (appliedStartModeKeyRef.current === appliedKey) {
        setHasAppliedStartMode(true)
        return
      }
      if (options.startMode === 'existing_list') {
        if (listLoadStatus === 'loading') return
        if (listLoadStatus === 'error') {
          await appendAssistantAndStore(
            '쇼핑리스트를 불러오지 못해 확인 단계를 건너뛸게요. "추천해줘" 또는 "길 안내 시작"처럼 말씀해 주세요.',
          )
          appliedStartModeKeyRef.current = appliedKey
          setHasAppliedStartMode(true)
          return
        }
        if (listLoadStatus !== 'ok') return
        const n = contextRef.current.shoppingList.length
        if (n > 0) {
          await appendAssistantAndStore(
            `현재 쇼핑리스트에 ${n}권이 있어요. 이 리스트로 확정하고 진행할까요? "진행" 또는 "확정"이라고 답하시거나, 책을 더하고 싶으면 "데미안 추가해줘"처럼 말씀해 주세요.`,
          )
        } else {
          await appendAssistantAndStore(
            '쇼핑리스트가 비어 있어요. 이대로 시작할까요? 진행하시려면 "진행", 책을 추가하시려면 책 이름을 말씀해 주세요.',
          )
        }
        updateExistingListGate({ status: 'awaiting' })
        appliedStartModeKeyRef.current = appliedKey
        setHasAppliedStartMode(true)
        return
      }
      if (options.startMode === 'build_list_chat') {
        setBuildFlow((prev) => ({ ...prev, step: 'step1_question_1' }))
        await appendAssistantAndStore(`좋아요. 리스트를 함께 만들어요.\n${STEP1_Q1}`)
        appliedStartModeKeyRef.current = appliedKey
        setHasAppliedStartMode(true)
        return
      }
      setContext({ listType: '쇼핑리스트' })
      await appendAssistantAndStore(
        '계획 없이 바로 출발합니다. 화면에 보이는 추천이나 제가 말해드리는 추천에 집중해 주세요. 원하시면 바로 쇼핑리스트에 저장할 수 있어요.',
      )
      appliedStartModeKeyRef.current = appliedKey
      setHasAppliedStartMode(true)
    }
    void run()
  }, [
    activeUsersId,
    appendAssistantAndStore,
    conversationReady,
    hasAppliedStartMode,
    listLoadStatus,
    options.startMode,
    setContext,
    updateExistingListGate,
  ])

  /**
   * Shared post-execute pipeline used by both the `confirm` flow and the
   * regular intent flow: telemetry → context patch (incl. transitioned state)
   * → assistant message → fallbackTool on failure.
   */
  const runToolWithFallback = useCallback(
    async (
      toolCall: ToolCall,
      intentTypeForOutcome: string,
      extraContextPatch?: Partial<AgentContext>,
    ): Promise<ToolResult> => {
      const t0 = performance.now()
      const result = await executeTool(toolCall, toolExecutionContext)
      recordToolLatency(toolCall.name, performance.now() - t0)

      if (result.ok) incrementMetric('toolSuccess')
      else incrementMetric('toolFailure')
      recordIntentOutcome(intentTypeForOutcome, result.ok)

      setContext({
        ...(extraContextPatch ?? {}),
        ...recommendationContextPatch(toolCall, result, contextRef.current, RECENT_RECOMMENDED_CAP),
        lastToolResult: result,
        state: transitionStateFromTool(contextRef.current.state, result),
      })

      const recAttach = recommendationAttachmentsFromResult(result)
      const rewritten = await rewriteAssistantMessage(result, recAttach)
      if (rewritten) incrementMetric('llmRewriterUsed')
      else incrementMetric('llmRewriterFallback')
      const primaryAssistantText = rewritten ?? result.message
      await appendAssistantAndStore(primaryAssistantText, recAttach)

      if (!result.ok) {
        incrementMetric('fallbackUsed')
        if (result.errorCode) recordBridgeErrorCode(result.errorCode)
        const fallback = await executeTool(
          { name: 'fallbackTool', args: { reason: result.errorCode ?? 'UNKNOWN' } },
          toolExecutionContext,
        )
        if (!isRedundantFallbackAssistantText(primaryAssistantText, fallback.message)) {
          await appendAssistantAndStore(fallback.message)
        }
      }

      await runEditFollowUp(result, appendAssistantAndStore)

      return result
    },
    [appendAssistantAndStore, runEditFollowUp, setContext, toolExecutionContext],
  )

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

  const actionCard = useMemo(
    () => {
      const cart = context.cartItems.length > 0 ? context.cartItems : context.shoppingList
      return buildChatActionCard(options.startMode, buildFlow, cart)
    },
    [buildFlow, context.cartItems, context.shoppingList, options.startMode],
  )

  const loadCandidatesForTheme = useCallback(
    async (theme: ThemeOption, refreshCount: number): Promise<RecommendationCandidate[]> => {
      const toolCall: ToolCall = { name: 'recommendationTool', args: { mode: 'taste' } }
      const rec = await executeTool(toolCall, toolExecutionContext)
      if (!rec.ok) return []
      const recoPatch = recommendationContextPatch(toolCall, rec, contextRef.current, RECENT_RECOMMENDED_CAP)
      if (Object.keys(recoPatch).length > 0) setContext(recoPatch)
      const data = rec.data as {
        candidates?: { title: string; authors: string; booksId?: string }[]
        recommendations?: string[]
      } | undefined
      let pool = data?.candidates ?? []
      if (pool.length === 0 && Array.isArray(data?.recommendations)) {
        pool = data.recommendations
          .map((line) => {
            const body = line.replace(/^[^0-9]*\d+\.\s*/, '')
            const [titleRaw, authorsRaw] = body.split(/\s-\s/)
            return {
              title: (titleRaw ?? '').trim(),
              authors: (authorsRaw ?? '저자 미상').trim(),
            }
          })
          .filter((item) => item.title.length > 0)
      }
      if (pool.length === 0) return []
      const rankedPool = rankThemeCandidates(pool, theme)
      const offset = refreshCount % rankedPool.length
      const first = rankedPool[offset]
      const second = rankedPool[(offset + 1) % rankedPool.length]
      const base = [first, second].filter(Boolean)
      const reviewKeywords = theme.keywords.slice(0, 3)
      return base.map((item) => ({
        title: item.title,
        authors: item.authors || '저자 미상',
        reason: theme.reason ?? `"${theme.name}" 방향과 사용자 답변을 반영한 추천`,
        reviewKeywords: reviewKeywords.length > 0 ? reviewKeywords : ['공감', '가독성'],
      }))
    },
    [setContext, toolExecutionContext],
  )

  const loadThemesForAnswers = useCallback(
    async (answers: string[]): Promise<ThemeOption[]> => {
      const [q1, q2] = answers
      const startedAt = performance.now()
      const llmResult = await generateThemesWithLlm({
        q1: q1 ?? '',
        q2: q2 ?? '',
        context: {
          listType: contextRef.current.listType,
          state: contextRef.current.state,
        },
      })
      recordThemeLlmLatency(performance.now() - startedAt)
      if (llmResult.ok) {
        incrementMetric('themeLlmUsed')
        return llmResult.themes.map((theme) => ({
          id: theme.id,
          name: theme.name,
          description: theme.description,
          reason: theme.reason,
          keywords: theme.keywords,
        }))
      }
      incrementMetric('themeLlmFallback')
      if (llmResult.reason === 'parse_error' || llmResult.reason === 'schema_error') {
        incrementMetric('themeLlmParseError')
      }
      return buildThemeOptions(answers)
    },
    [],
  )

  const submitUserText = useCallback(
    async (text: string, source: AgentIntentSource = 'chat') => {
      const normalized = text.replace(/\r\n/g, '\n')
      const intentText = normalized.trim()
      if (!intentText) return

      setBusy(true)
      setLastFailedUserText(null)
      try {
        if (options.startMode === 'build_list_chat' && buildFlow.step !== 'idle') {
          await appendUserMessageAndStore({
            text: normalized,
            conversationId: conversationIdRef.current,
            intent: 'select_list_mode',
            setMessages,
          })
          const handled = await handleBuildFlowInput({
            buildFlow,
            intentText,
            appendAssistantAndStore,
            setBuildFlow,
            loadThemesForAnswers,
            loadCandidatesForTheme,
            runToolWithFallback,
            getShoppingListCount: () => contextRef.current.cartItems.length,
          })
          if (handled) {
            return
          }
        }

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
          updateExistingListGate({ status: 'confirmed' })
          await appendAssistantAndStore('리스트를 확정했어요. 최단 경로 안내를 시작할게요.')
          await runToolWithFallback({ name: 'routePlannerTool', args: { mode: 'shortest' } }, 'route_replan_shortest')
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
            await appendAssistantAndStore('요청을 이해하지 못했어요. 예: "추천해줘", "책 검색 데미안", "책 추가 데미안".')
            recordIntentOutcome('unknown', false)
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
      buildFlow,
      handleCancelIntent,
      handleConfirmIntent,
      loadCandidatesForTheme,
      loadThemesForAnswers,
      options.startMode,
      runToolWithFallback,
      setContext,
      existingListGateRef,
      updateExistingListGate,
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
    async (reason: 'add' | 'remove', imageBase64: string) => {
      if (!imageBase64.trim()) return
      setBusy(true)
      setLastFailedUserText(null)
      try {
        const label = reason === 'add' ? '표지 인식 · 담기' : '표지 인식 · 빼기'
        await appendUserMessageAndStore({
          text: `[${label}]`,
          conversationId: conversationIdRef.current,
          intent: reason === 'add' ? 'add_book' : 'remove_book',
          setMessages,
        })
        const intentType = reason === 'add' ? 'add_book' : 'remove_book'
        const result = await runToolWithFallback(
          { name: 'shoppingListTool', args: { action: reason, imageBase64 } },
          intentType,
        )
        if (!result.ok) {
          setLastFailedUserText(`[${label}]`)
        }
      } finally {
        setBusy(false)
      }
    },
    [runToolWithFallback, setMessages],
  )

  return {
    messages,
    submitUserText,
    submitAgentInput,
    applyBookRecognitionCapture,
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
  }
}
