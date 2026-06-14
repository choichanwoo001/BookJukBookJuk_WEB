import type { AgentState, ToolResult } from './types'

function stateAfterTool(current: AgentState, result: ToolResult): AgentState {
  if (!result.ok) {
    return current
  }

  switch (result.toolName) {
    case 'shoppingListTool':
      return 'LIST_EDIT'
    case 'recommendationTool':
      return 'RECO_DISCOVERY'
    case 'routePlannerTool':
      return 'NAV_EXEC'
    case 'mobilityControlTool':
      return 'NAV_EXEC'
    case 'checkoutTool':
      return 'SESSION_END'
    default:
      return current
  }
}

export function transitionStateFromIntent(current: AgentState, intentType: string): AgentState {
  if (current === 'INIT') {
    return 'MODE_SELECT'
  }

  if (intentType === 'request_recommendation') return 'RECO_DISCOVERY'
  if (intentType === 'select_browse_mode') return 'MODE_SELECT'
  if (intentType === 'route_replan_shortest') return 'NAV_PLAN'
  if (intentType === 'pause_mobility' || intentType === 'resume_mobility') return 'NAV_EXEC'
  if (intentType === 'follow_robot' || intentType === 'lead_robot') return 'NAV_EXEC'
  if (intentType === 'cancel') return current

  return current
}

export function transitionStateFromTool(current: AgentState, result: ToolResult): AgentState {
  return stateAfterTool(current, result)
}
