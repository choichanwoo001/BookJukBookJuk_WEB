import { parseIntent } from '../intentParser'
import type { AgentIntent, AgentIntentSource, RecommendationToolData, ToolCall, ToolResult } from '../types'
import { mapIntentToTool } from './mapIntentToTool'

/**
 * Thin domain facade for the chat agent (W17):
 * intent parsing + intent → tool mapping + UI extraction helpers.
 * IO (React state, Supabase) stays in the calling hook.
 */

export function parseUserIntent(text: string, source: AgentIntentSource = 'chat'): AgentIntent {
  return parseIntent(text, source)
}

export function toolCallForIntent(intent: AgentIntent): ToolCall | null {
  return mapIntentToTool(intent)
}

/** Extract follow-up lines for chat UI from tool result (W7). */
export function recommendationAttachmentsFromResult(result: ToolResult): string[] | undefined {
  if (!result.ok || result.toolName !== 'recommendationTool') return undefined
  const d = result.data
  if (d && typeof d === 'object' && 'recommendations' in d && Array.isArray((d as RecommendationToolData).recommendations)) {
    return (d as RecommendationToolData).recommendations
  }
  return undefined
}
