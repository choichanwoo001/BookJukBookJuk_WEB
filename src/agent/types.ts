export type AgentState =
  | 'INIT'
  | 'MODE_SELECT'
  | 'LIST_EDIT'
  | 'RECO_DISCOVERY'
  | 'NAV_PLAN'
  | 'NAV_EXEC'
  | 'GOAL_CHECK'
  | 'SESSION_END'

export type AgentIntentType =
  | 'select_list_mode'
  | 'select_recommend_mode'
  | 'select_browse_mode'
  | 'pause_mobility'
  | 'resume_mobility'
  | 'add_book'
  | 'remove_book'
  | 'list_update_quantity'
  | 'list_change_type'
  | 'route_replan_shortest'
  | 'request_recommendation'
  | 'confirm'
  | 'cancel'
  | 'unknown'

export type AgentIntentSource = 'chat' | 'voice' | 'gesture' | 'system'

export type AgentIntent = {
  type: AgentIntentType
  source: AgentIntentSource
  rawText: string
  confidence: number
  payload?: Record<string, string | number | boolean>
  timestamp: number
}

export type ToolCall = {
  name: string
  args: Record<string, unknown>
}

/** Discriminated tool payloads (W15). */
export type ShoppingListToolData = {
  shoppingList: { booksId: string; title: string }[]
}

export type RecommendationToolData = {
  recommendations: string[]
  source: string
}

export type RoutePlannerToolData = {
  mode: string
}

export type GoalCheckToolData = {
  checked: boolean
}

export type ToolResultData =
  | ShoppingListToolData
  | RecommendationToolData
  | RoutePlannerToolData
  | GoalCheckToolData
  | Record<string, unknown>

export type ToolResult = {
  ok: boolean
  toolName: string
  message: string
  data?: ToolResultData
  errorCode?: string
  needsConfirmation?: boolean
}

export type PendingConfirmation = {
  toolName: string
  args: Record<string, unknown>
  summary: string
}

export type ShoppingListEntry = {
  booksId: string
  title: string
}

export type AgentContext = {
  state: AgentState
  mobilityPaused: boolean
  listType: string
  shoppingList: ShoppingListEntry[]
  pendingConfirmation: PendingConfirmation | null
  lastToolResult: ToolResult | null
}

export type AgentMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  createdAt: number
  /** Extra lines (e.g. recommendation bullets) shown under the bubble (W7). */
  attachments?: string[]
}

export type AgentEvent =
  | { type: 'USER_MESSAGE'; text: string; source?: AgentIntentSource; timestamp: number }
  | { type: 'TOOL_RESULT'; result: ToolResult }
  | { type: 'CONFIRM_ACCEPTED'; timestamp: number }
  | { type: 'CONFIRM_REJECTED'; timestamp: number }

export type ToolExecutionContext = {
  getContext: () => AgentContext
  setContext: (next: Partial<AgentContext>) => void
}

/** Multimodal input item for unified queue (W18). */
export type AgentUserInput = {
  text: string
  source: AgentIntentSource
  timestamp: number
}
