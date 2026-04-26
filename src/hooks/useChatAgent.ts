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
import { executeTool } from '../agent/tools/registry'
import { getDefaultUserId } from '../lib/supabase/env'
import {
  appendConversationMessage,
  getOrCreateConversation,
  loadConversationMessages,
} from '../lib/supabase/conversation'
import { loadShelfBooks, mapListTypeToShelfType } from '../lib/supabase/shelves'
import type {
  AgentContext,
  AgentIntent,
  AgentIntentSource,
  AgentMessage,
  ToolCall,
  ToolExecutionContext,
  ToolResult,
} from '../agent/types'

const initialContextValue = (): AgentContext => ({
  state: 'INIT',
  mobilityPaused: false,
  listType: '일반',
  shoppingList: [],
  pendingConfirmation: null,
  lastToolResult: null,
})

const initialMessages: AgentMessage[] = [
  { id: 'a1', role: 'assistant', text: '강의실 3D 맵에 오신 것을 환영합니다.', createdAt: Date.now() },
  { id: 'a2', role: 'assistant', text: 'WASD로 이동하고, 시점은 정면 고정입니다.', createdAt: Date.now() + 1 },
  { id: 'a3', role: 'assistant', text: '리스트를 선택하거나 추천을 요청해 주세요.', createdAt: Date.now() + 2 },
]

function createAssistant(text: string, attachments?: string[]): AgentMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    text,
    attachments,
    createdAt: Date.now(),
  }
}

export function useChatAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages)
  const [context, setContextState] = useState<AgentContext>(initialContextValue)
  const contextRef = useRef<AgentContext>(context)
  const [latestMapSnapshot, setLatestMapSnapshot] = useState<AgentMapSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(null)
  const intentBufferRef = useRef<AgentIntent | null>(null)
  const conversationIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    contextRef.current = context
  }, [context])

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
    const initializeConversation = async () => {
      const usersId = getDefaultUserId()
      const conversationId = await getOrCreateConversation(usersId)
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
  }, [])

  useEffect(() => {
    let disposed = false
    const loadList = async () => {
      const usersId = getDefaultUserId()
      const shelfType = mapListTypeToShelfType(context.listType)
      const res = await loadShelfBooks(usersId, shelfType)
      if (disposed || !res.ok) return
      setContext({
        shoppingList: res.data.map((b) => ({ booksId: b.booksId, title: b.title })),
      })
    }
    void loadList()
    return () => {
      disposed = true
    }
  }, [context.listType, setContext])

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
      await appendAssistantAndStore(result.message, recAttach)

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
      const trimmed = text.trim()
      if (!trimmed) return

      setBusy(true)
      setLastFailedUserText(null)
      try {
        const nextIntent = parseUserIntent(trimmed, source)
        const mergedIntent = intentBufferRef.current
          ? chooseHigherPriorityIntent(intentBufferRef.current, nextIntent)
          : nextIntent
        intentBufferRef.current = null

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', text: trimmed, createdAt: Date.now() },
        ])
        if (conversationIdRef.current) {
          await appendConversationMessage({
            conversationId: conversationIdRef.current,
            role: 'user',
            content: trimmed,
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

        const toolCall = toolCallForIntent(mergedIntent)
        if (!toolCall) {
          if (mergedIntent.type === 'unknown') {
            await appendAssistantAndStore('요청을 이해하지 못했어요. 예: "멈춰", "책 추가", "최단경로 재계산".')
            recordIntentOutcome('unknown', false)
            return
          }
          await appendAssistantAndStore('현재 이 요청은 아직 연결되지 않았어요.')
          recordIntentOutcome(mergedIntent.type, false)
          return
        }

        if (requiresConfirmation(mergedIntent)) {
          incrementMetric('reconfirmRequested')
          setContext({
            pendingConfirmation: {
              toolName: toolCall.name,
              args: toolCall.args,
              summary: `${mergedIntent.rawText} 요청을 실행할까요? 확인 버튼을 누르거나 "오케이"라고 입력하면 진행합니다.`,
            },
          })
          await appendAssistantAndStore(`${mergedIntent.rawText} 요청을 실행할까요? 카드에서 확인하거나 오케이라고 입력해 주세요.`)
          return
        }

        if (mergedIntent.type === 'pause_mobility' || mergedIntent.type === 'resume_mobility') {
          incrementMetric('interruptHandled')
        }

        const result = await runToolWithFallback(toolCall, mergedIntent.type)

        if (!result.ok) {
          setLastFailedUserText(trimmed)
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
  }
}
