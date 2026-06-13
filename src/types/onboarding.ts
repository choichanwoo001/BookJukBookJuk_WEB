export type VisitType = 'first' | 'returning'

export type OnboardingStep =
  | 'visit_choice'
  | 'balance_game'
  | 'taste_analysis'
  | 'qr_login'
  | 'similar_readers'
  | 'llm_required'
  | 'session_start'
  | 'app'

export type TasteSeed = {
  tasteTags: string[]
  tone: string
  pace: string
  interest: string
}

export type ReaderBook = {
  id: string
  title: string
  author: string
  coverUrl?: string
  rating?: number
  reviewCount?: number
  reason: string
}

export type ReaderProfile = {
  id: string
  name: string
  avatarTone: string
  avatarUrl?: string
  tagline: string
  similarity: number
  reasons: string[]
  description: string
  tasteTags: string[]
  likedBooks: ReaderBook[]
  readBooks: ReaderBook[]
}
