import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseUserIntent,
  recommendationAttachmentsFromResult,
  toolCallForIntent,
} from '../agent/runtime/chatAgentRuntime'
import { chooseHigherPriorityIntent, requiresConfirmation } from '../agent/policy'
import { transitionStateFromIntent, transitionStateFromTool } from '../agent/stateMachine'
import {
  getTelemetrySnapshot,
  incrementMetric,
  recordBridgeErrorCode,
  recordIntentOutcome,
  recordToolLatency,
} from '../agent/telemetry'
import { subscribeMapSnapshot, type AgentMapSnapshot } from '../agent/runtime/agentEventBus'
import { planWithLlm } from '../agent/runtime/llmPlanner'
import { rewriteAssistantMessage } from '../agent/runtime/llmRewriter'
import { executeTool } from '../agent/tools/registry'
import { normalizeListHint } from '../agent/listHintNormalize'
import { getDefaultUserId } from '../lib/supabase/env'
import { getCurrentWebSessionUsersId } from '../lib/supabase/qrLogin'
import {
  appendConversationMessage,
  getOrCreateConversation,
  loadConversationMessages,
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
  ToolCall,
  ToolExecutionContext,
  ToolResult,
} from '../agent/types'

const initialContextValue = (): AgentContext => ({
  state: 'INIT',
  mobilityPaused: false,
  listType: '쇼핑리스트',
  activeUsersId: undefined,
  shoppingList: [],
  pendingConfirmation: null,
  lastToolResult: null,
})

const initialMessages: AgentMessage[] = [
  { id: 'a1', role: 'assistant', text: '강의실 3D 맵에 오신 것을 환영합니다.', createdAt: Date.now() },
  { id: 'a2', role: 'assistant', text: 'WASD로 이동하고, 시점은 정면 고정입니다.', createdAt: Date.now() + 1 },
  {
    id: 'a3',
    role: 'assistant',
    text: '리스트가 없어도 괜찮아요. 채팅으로 추천/검색 후 바로 쇼핑리스트를 만들 수 있어요.',
    createdAt: Date.now() + 2,
  },
]

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
  'select_recommend_mode',
  'select_browse_mode',
  'search_books',
  'pause_mobility',
  'resume_mobility',
  'add_book',
  'remove_book',
  'list_update_quantity',
  'list_change_type',
  'route_replan_shortest',
  'request_recommendation',
  'confirm',
  'cancel',
  'unknown',
]

function asIntentType(input: string): AgentIntentType {
  return (VALID_INTENT_TYPES as string[]).includes(input) ? (input as AgentIntentType) : 'unknown'
}

export function useChatAgent(options: { startMode: StartMode }) {
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages)
  const messagesRef = useRef<AgentMessage[]>(messages)
  const [context, setContextState] = useState<AgentContext>(initialContextValue)
  const contextRef = useRef<AgentContext>(context)
  const [latestMapSnapshot, setLatestMapSnapshot] = useState<AgentMapSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(null)
  const intentBufferRef = useRef<AgentIntent | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const [listLoadStatus, setListLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [listLoadMessage, setListLoadMessage] = useState<string | null>(null)
  const [activeUsersId, setActiveUsersId] = useState<string | null>(null)
  const [hasAppliedStartMode, setHasAppliedStartMode] = useState(false)
  const shouldAutoLoadShelf = options.startMode === 'existing_list'

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
      const conversationId = await getOrCreateConversation(activeUsersId)
      if (!conversationId || disposed) return
      conversationIdRef.current = conversationId
      const history = await loadConversationMessages(conversationId)
      if (disposed || history.length === 0) return
      setMessages(
        history.map((item) => ({
          id: item.id,
          role: item.role,
          text: item.content,
          createdAt: item.createdAt,
        })),
      )
    }
    void initializeConversation()
    return () => {
      disposed = true
    }
  }, [activeUsersId])

  useEffect(() => {
    if (!activeUsersId || shouldAutoLoadShelf) return
    setListLoadStatus('ok')
    setListLoadMessage(null)
  }, [activeUsersId, shouldAutoLoadShelf])

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
      setContext({ shoppingList: toContextShoppingList(res.data) })
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
    setContext({ shoppingList: toContextShoppingList(res.data) })
    setListLoadStatus('ok')
    setListLoadMessage(null)
    return true
  }, [activeUsersId, setContext])

  useEffect(() => {
    if (!activeUsersId || hasAppliedStartMode) return
    const run = async () => {
      if (options.startMode === 'existing_list') {
        await appendAssistantAndStore(
          '기존 쇼핑리스트를 기준으로 바로 안내를 시작할게요. "추천해줘" 또는 "길 안내 시작"처럼 말씀해 주세요.',
        )
        setHasAppliedStartMode(true)
        return
      }
      if (options.startMode === 'build_list_chat') {
        await appendAssistantAndStore(
          '좋아요. 채팅으로 쇼핑리스트를 함께 만들어요. 원하는 주제나 책을 말하면 바로 추가를 도와드릴게요.',
        )
        setHasAppliedStartMode(true)
        return
      }
      setContext({ listType: '쇼핑리스트' })
      await appendAssistantAndStore(
        '리스트 없이 탐색 모드로 시작할게요. 이동 중 추천을 드리고, 마음에 들면 관심/이력 리스트에 즉시 저장할 수 있어요.',
      )
      setHasAppliedStartMode(true)
    }
    void run()
  }, [activeUsersId, appendAssistantAndStore, hasAppliedStartMode, options.startMode, setContext])

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
        lastToolResult: result,
        state: transitionStateFromTool(contextRef.current.state, result),
      })

      const recAttach = recommendationAttachmentsFromResult(result)
      const rewritten = await rewriteAssistantMessage(result, recAttach)
      if (rewritten) incrementMetric('llmRewriterUsed')
      else incrementMetric('llmRewriterFallback')
      await appendAssistantAndStore(rewritten ?? result.message, recAttach)

      if (!result.ok) {
        incrementMetric('fallbackUsed')
        if (result.errorCode) recordBridgeErrorCode(result.errorCode)
        const fallback = await executeTool(
          { name: 'fallbackTool', args: { reason: result.errorCode ?? 'UNKNOWN' } },
          toolExecutionContext,
        )
        await appendAssistantAndStore(fallback.message)
      }

      return result
    },
    [appendAssistantAndStore, setContext, toolExecutionContext],
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

  const submitUserText = useCallback(
    async (text: string, source: AgentIntentSource = 'chat') => {
      const normalized = text.replace(/\r\n/g, '\n')
      const intentText = normalized.trim()
      if (!intentText) return

      setBusy(true)
      setLastFailedUserText(null)
      try {
        const llmPlan = await planWithLlm({
          text: intentText,
          source,
          context: contextRef.current,
          history: messagesRef.current,
        })
        const nextIntent = llmPlan
          ? ({
              type: asIntentType(llmPlan.intentType),
              source,
              rawText: text,
              confidence: llmPlan.confidence,
              payload: undefined,
              timestamp: Date.now(),
            } satisfies AgentIntent)
          : parseUserIntent(intentText, source)
        if (llmPlan) incrementMetric('llmPlannerUsed')
        else incrementMetric('llmPlannerFallback')
        const mergedIntent = intentBufferRef.current
          ? chooseHigherPriorityIntent(intentBufferRef.current, nextIntent)
          : nextIntent
        intentBufferRef.current = null

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', text: normalized, createdAt: Date.now() },
        ])
        if (conversationIdRef.current) {
          await appendConversationMessage({
            conversationId: conversationIdRef.current,
            role: 'user',
            content: normalized,
            intent: mergedIntent.type,
          })
        }

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

        if (mergedIntent.type === 'select_browse_mode') {
          setContext({ listType: '쇼핑리스트' })
          await appendAssistantAndStore(
            '출발 전 리스트 만들기로 시작할게요. "추천해줘", "책 검색 <제목>", "책 추가 <제목>"처럼 말해 주세요.',
          )
          recordIntentOutcome('select_browse_mode', true)
          return
        }

        const deterministicToolCall = toolCallForIntent(mergedIntent)
        let toolCall = llmPlan?.toolCall ?? deterministicToolCall
        if (toolCall && deterministicToolCall && toolCall.name === deterministicToolCall.name) {
          // Keep planner flexibility but backfill required deterministic args.
          toolCall = {
            name: toolCall.name,
            args: {
              ...deterministicToolCall.args,
              ...toolCall.args,
            },
          }
        }
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
      handleCancelIntent,
      handleConfirmIntent,
      runToolWithFallback,
      setContext,
    ],
  )

  const acceptConfirmation = useCallback(() => {
    void submitUserText('오케이', 'chat')
  }, [submitUserText])

  const cancelConfirmation = useCallback(() => {
    void submitUserText('취소', 'chat')
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

  return {
    messages,
    submitUserText,
    submitAgentInput,
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
  }
}
