import type { AgentIntent, AgentIntentSource, AgentIntentType } from './types'

const destructiveIntentSet = new Set<AgentIntentType>([
  'remove_book',
  'route_replan_shortest',
])

export function isDestructiveIntent(type: AgentIntentType): boolean {
  return destructiveIntentSet.has(type)
}

export function requiresConfirmation(intent: AgentIntent): boolean {
  if (intent.type === 'unknown' || intent.type === 'cancel' || intent.type === 'confirm') return false
  if (intent.confidence < 0.62) return true
  return isDestructiveIntent(intent.type)
}

export function chooseHigherPriorityIntent(a: AgentIntent, b: AgentIntent): AgentIntent {
  if (a.type === 'pause_mobility') return a
  if (b.type === 'pause_mobility') return b

  if (a.type === 'cancel' && b.type !== 'cancel') return a
  if (b.type === 'cancel' && a.type !== 'cancel') return b

  if (a.source === 'voice' && b.source !== 'voice') return a
  if (b.source === 'voice' && a.source !== 'voice') return b

  return a.timestamp >= b.timestamp ? a : b
}

export function isListEditIntentType(type: AgentIntentType): boolean {
  return type === 'add_book' || type === 'remove_book'
}

/**
 * Keyword/rule parser wins for 쇼핑리스트 추가·삭제 when it matches, so LLM mislabels
 * (e.g. recommendation) do not override deterministic list-edit intents.
 */
export function mergePlannerIntentWithRules(input: {
  ruleIntent: AgentIntent
  llmPlan: { intentType: string; confidence: number } | null
  rawTextForLlm: string
  source: AgentIntentSource
  llmIntentType: AgentIntentType
  hasUsableLlmIntent: boolean
}): AgentIntent {
  const { ruleIntent, llmPlan, rawTextForLlm, source, llmIntentType, hasUsableLlmIntent } = input
  if (isListEditIntentType(ruleIntent.type)) {
    return ruleIntent
  }
  if (ruleIntent.type === 'confirm' || ruleIntent.type === 'cancel') {
    return ruleIntent
  }
  if (hasUsableLlmIntent && llmPlan) {
    return {
      type: llmIntentType,
      source,
      rawText: rawTextForLlm,
      confidence: llmPlan.confidence,
      payload: undefined,
      timestamp: Date.now(),
    }
  }
  return ruleIntent
}
