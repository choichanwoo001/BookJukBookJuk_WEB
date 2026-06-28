import type { AgentIntent, ToolCall } from '../types'

export function mapIntentToTool(intent: AgentIntent): ToolCall | null {
  const query = typeof intent.payload?.query === 'string' ? intent.payload.query : intent.rawText.trim()

  switch (intent.type) {
    case 'pause_mobility':
      return { name: 'mobilityControlTool', args: { action: 'pause' } }
    case 'resume_mobility':
      return { name: 'mobilityControlTool', args: { action: 'resume' } }
    case 'follow_robot':
      return { name: 'mobilityControlTool', args: { action: 'guidance' } }
    case 'lead_robot':
      return { name: 'mobilityControlTool', args: { action: 'escort' } }
    case 'checkout':
      return { name: 'checkoutTool', args: {} }
    case 'add_book':
      return { name: 'shoppingListTool', args: { action: 'add', hint: intent.rawText } }
    case 'remove_book':
      return { name: 'shoppingListTool', args: { action: 'remove', hint: intent.rawText } }
    case 'route_replan_shortest':
      return { name: 'routePlannerTool', args: { mode: 'shortest' } }
    case 'request_recommendation': {
      const t = intent.rawText.toLowerCase()
      if (/(가까운|근처|동선|위치|서가\s*근처|가까이|지금\s*위치)/.test(t)) {
        return { name: 'recommendationTool', args: { mode: 'location' } }
      }
      if (/(평점|인기|베스트|높은\s*점|별점)/.test(t)) {
        return { name: 'recommendationTool', args: { mode: 'rating' } }
      }
      return { name: 'recommendationTool', args: { mode: 'taste' } }
    }
    case 'search_books':
      return { name: 'bookSearchTool', args: { query, limit: 5 } }
    default:
      return null
  }
}
