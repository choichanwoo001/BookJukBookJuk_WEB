import type { AgentIntent, ToolCall } from '../types'

export function mapIntentToTool(intent: AgentIntent): ToolCall | null {
  const qty = typeof intent.payload?.quantity === 'number' ? intent.payload.quantity : 1
  const listType =
    typeof intent.payload?.listType === 'string' ? intent.payload.listType : '쇼핑리스트'
  const query = typeof intent.payload?.query === 'string' ? intent.payload.query : intent.rawText.trim()

  switch (intent.type) {
    case 'pause_mobility':
      return { name: 'mobilityControlTool', args: { action: 'pause' } }
    case 'resume_mobility':
      return { name: 'mobilityControlTool', args: { action: 'resume' } }
    case 'add_book':
      return { name: 'shoppingListTool', args: { action: 'add', hint: intent.rawText } }
    case 'remove_book':
      return { name: 'shoppingListTool', args: { action: 'remove', hint: intent.rawText } }
    case 'list_update_quantity':
      return { name: 'shoppingListTool', args: { action: 'updateQuantity', quantity: qty } }
    case 'list_change_type':
      return { name: 'shoppingListTool', args: { action: 'changeType', listType } }
    case 'route_replan_shortest':
      return { name: 'routePlannerTool', args: { mode: 'shortest' } }
    case 'request_recommendation':
      return { name: 'recommendationTool', args: { mode: 'taste' } }
    case 'select_recommend_mode':
      return { name: 'recommendationTool', args: { mode: 'taste' } }
    case 'search_books':
      return { name: 'bookSearchTool', args: { query, limit: 5 } }
    default:
      return null
  }
}
