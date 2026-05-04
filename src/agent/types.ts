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
  | 'select_browse_mode'
  | 'search_books'
  | 'pause_mobility'
  | 'resume_mobility'
  | 'add_book'
  | 'remove_book'
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
  shoppingList: { booksId: string; title: string; authors?: string; coverImageUrl?: string }[]
}

export type RecommendationToolData = {
  recommendations: string[]
  source: string
  candidates?: { booksId: string; title: string; authors: string }[]
  tasteMeta?: {
    richness: number
    computedAt: string
    topGenres: string[]
    topAuthors: string[]
    reasons: string[]
    profileStatus: 'strong' | 'mixed' | 'weak' | 'stale' | 'none'
  }
}

export type RecommendationMode = 'taste' | 'location' | 'rating'

export type BookSearchToolData = {
  books: { title: string; authors: string }[]
  query: string
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
  | BookSearchToolData
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
  authors?: string
  coverImageUrl?: string
}

export type AgentContext = {
  state: AgentState
  mobilityPaused: boolean
  listType: string
  activeUsersId?: string
  shoppingList: ShoppingListEntry[]
  /** 세션 내 최근 추천에 노출된 책 id (연속 추천 다양화용, 쇼핑리스트와 별도). */
  recentlyRecommendedBookIds: string[]
  /** 취향 추천 상위 창 슬라이스 로테이션 카운터. */
  recommendationDiversityRound: number
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

export type ChatActionOption = {
  id: string
  label: string
  inputText: string
}

export type ChatActionCard = {
  title: string
  description?: string
  options: ChatActionOption[]
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
