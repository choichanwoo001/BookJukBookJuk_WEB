import type { AgentIntent, AgentIntentType } from './types'

const destructiveIntentSet = new Set<AgentIntentType>([
  'remove_book',
  'route_replan_shortest',
  'list_change_type',
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
