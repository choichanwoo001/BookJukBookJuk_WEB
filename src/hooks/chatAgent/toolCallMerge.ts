import { normalizeListHint } from '../../agent/listHintNormalize'
import type { AgentIntentType, ToolCall } from '../../agent/types'

function isListEditIntent(intentType: AgentIntentType): boolean {
  return intentType === 'add_book' || intentType === 'remove_book'
}

function normalizeShoppingListAction(action: unknown): string {
  if (typeof action !== 'string') return ''
  const normalized = action.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'delete') return 'remove'
  return normalized
}

export function mergePlannedToolCall(
  deterministicToolCall: ToolCall | null,
  plannedToolCall: ToolCall | null,
  intentType: AgentIntentType,
): ToolCall | null {
  let effectivePlanned = plannedToolCall
  if (
    isListEditIntent(intentType) &&
    deterministicToolCall?.name === 'shoppingListTool' &&
    plannedToolCall &&
    plannedToolCall.name !== 'shoppingListTool'
  ) {
    effectivePlanned = null
  }
  const toolCall = effectivePlanned ?? deterministicToolCall
  if (!toolCall) return null

  const mergedArgs: Record<string, unknown> = deterministicToolCall
    ? {
        ...deterministicToolCall.args,
        ...toolCall.args,
      }
    : { ...toolCall.args }

  if (toolCall.name === 'shoppingListTool') {
    const plannedAction = normalizeShoppingListAction(toolCall.args.action)
    if (plannedAction) mergedArgs.action = plannedAction
  }
  if (!deterministicToolCall) {
    return {
      name: toolCall.name,
      args: mergedArgs,
    }
  }
  if (toolCall.name !== deterministicToolCall.name) {
    return {
      name: toolCall.name,
      args: mergedArgs,
    }
  }
  if (toolCall.name === 'shoppingListTool' && isListEditIntent(intentType)) {
    const deterministicAction =
      normalizeShoppingListAction(deterministicToolCall.args.action)
    const deterministicHint =
      typeof deterministicToolCall.args.hint === 'string' ? deterministicToolCall.args.hint : ''
    const llmHint = typeof toolCall.args.hint === 'string' ? toolCall.args.hint : ''
    const role = intentType === 'add_book' ? 'add' : 'remove'
    const normalizedPlannerHint = normalizeListHint(llmHint, role)
    // Require a minimum normalized length so command-only planner hints ("삭제해줘") stay deterministic.
    const plannerHintLooksLikeTitle =
      llmHint.length > 0 && normalizedPlannerHint.length >= 3
    // Keep list-edit action deterministic to avoid planner synonyms like "delete".
    if (deterministicAction) mergedArgs.action = deterministicAction
    mergedArgs.hint = plannerHintLooksLikeTitle ? llmHint : deterministicHint
  }

  return {
    name: toolCall.name,
    args: mergedArgs,
  }
}
