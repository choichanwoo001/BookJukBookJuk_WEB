import type { KakaoPaySession } from '../lib/payment/kakaoPay'

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
  | 'select_browse_mode'
  | 'search_books'
  | 'pause_mobility'
  | 'resume_mobility'
  | 'follow_robot'
  | 'lead_robot'
  | 'checkout'
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

export type RecommendationMode = 'taste' | 'location' | 'rating' | 'book_alternative'

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

export type CartItem = ShoppingListEntry

export type DwellBookCandidate = ShoppingListEntry & {
  detectedAt: number
  source: 'route' | 'cover' | 'manual'
}

export type CheckoutStatus = 'idle' | 'awaiting_payment' | 'going_to_counter' | 'completed' | 'error'

export type Receipt = {
  receiptId: string
  usersId: string
  items: CartItem[]
  purchasedAt: string
  qrPayload: string
}

export type TransitDetourPhase =
  | 'idle'
  | 'paused_for_follow'
  | 'serendipity_nav'
  | 'serendipity_dwell'
  | 'await_reco_accept'

export type AgentContext = {
  state: AgentState
  mobilityPaused: boolean
  listType: string
  activeUsersId?: string
  shoppingList: ShoppingListEntry[]
  cartItems: CartItem[]
  pendingDwellBook: DwellBookCandidate | null
  awaitingDwellFeedback: boolean
  /**
   * dwell 피드백 처리 후 보존되는 책 정보.
   * recommendationTool 결과가 나온 뒤 사용자가 "경로에 추가" 요청 시
   * 이 책과 추천 책을 함께 경로에 추가하기 위해 사용한다.
   */
  skippedDwellBook: DwellBookCandidate | null
  /** true이면 확장 경로가 활성화된 상태 — browse stop dwell 재감지를 막는다. */
  extendedRouteActive: boolean
  /** leg1 transit 중 STOP → follow_me serendipity detour 단계. */
  transitDetourPhase: TransitDetourPhase
  /** detour 후 이어갈 원래 nav leg (보통 1 = ② 너무나 많은 여름이). */
  resumeLegAfterDetour: number | null
  checkoutStatus: CheckoutStatus
  receipt: Receipt | null
  /** 카카오페이 QR 데모 결제 세션 (모달 표시용). */
  kakaoPaySession: KakaoPaySession | null
  /** 세션 내 최근 추천에 노출된 책 id (연속 추천 다양화용, 쇼핑리스트와 별도). */
  recentlyRecommendedBookIds: string[]
  /** 취향 추천 상위 창 슬라이스 로테이션 카운터. */
  recommendationDiversityRound: number
  pendingConfirmation: PendingConfirmation | null
  lastToolResult: ToolResult | null
}

export type RecognitionKind = 'voice' | 'gesture'

export type AgentMessage = {
  id: string
  role: 'assistant' | 'user' | 'recognition'
  text: string
  createdAt: number
  /** Extra lines (e.g. recommendation bullets) shown under the bubble (W7). */
  attachments?: string[]
  /** 인식 테스트 로그 (음성·제스처). */
  recognitionKind?: RecognitionKind
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
