import { useCallback } from 'react'
import { recommendationAttachmentsFromResult } from '../../agent/runtime/chatAgentRuntime'
import { rewriteAssistantMessage } from '../../agent/runtime/llmRewriter'
import { transitionStateFromTool } from '../../agent/stateMachine'
import {
  incrementMetric,
  recordBridgeErrorCode,
  recordIntentOutcome,
  recordToolLatency,
} from '../../agent/telemetry'
import { executeTool } from '../../agent/tools/registry'
import type { AgentContext, ToolCall, ToolExecutionContext, ToolResult } from '../../agent/types'
import { isDemoMode } from '../../config/demoMode'
import { llmFailureUserMessage } from '../../agent/runtime/llmClient'
import { readLlmEnv } from '../../agent/runtime/llmEnv'
import { isRedundantFallbackAssistantText } from './assistantMessageDedupe'
import { RECENT_RECOMMENDED_CAP, recommendationContextPatch } from './recommendationContext'

type MutableCurrent<T> = {
  current: T
}

type UseToolRunnerParams = {
  toolExecutionContext: ToolExecutionContext
  contextRef: MutableCurrent<AgentContext>
  setContext: (patch: Partial<AgentContext>) => void
  appendAssistantAndStore: (text: string, attachments?: string[]) => Promise<void>
}

export function useToolRunner({
  toolExecutionContext,
  contextRef,
  setContext,
  appendAssistantAndStore,
}: UseToolRunnerParams) {
  return useCallback(
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

      let primaryAssistantText = rewritten ?? result.message
      if (isDemoMode() && !rewritten && !readLlmEnv()) {
        primaryAssistantText = `${result.message} (${llmFailureUserMessage('env_missing')})`
        incrementMetric('llmRewriterFallback')
      }
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

      return result
    },
    [appendAssistantAndStore, contextRef, setContext, toolExecutionContext],
  )
}
