import { getSupabaseClient } from './client'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured } from './result'

export type BookPreview = {
  id: string
  title: string
  authors: string
  coverImageUrl: string
  kdcClassName: string
  sector: number
}

export type BookMatchCandidate = {
  book: BookPreview
  score: number
}

type WeightEntry = { key: string; weight: number }

export type TasteProfileSnapshot = {
  usersId: string
  seedWeights: WeightEntry[]
  genreWeights: WeightEntry[]
  authorWeights: WeightEntry[]
  richness: number
  actionCount: number
  uniqueBookCount: number
  computedAt: string
  recentActionsSummary: string[]
}

export type TasteRecommendationData = {
  books: BookPreview[]
  source: 'taste' | 'rating_fallback' | 'location_fallback'
  profileStatus: 'strong' | 'mixed' | 'weak' | 'stale' | 'none'
  richness: number
  computedAt: string
  topGenres: string[]
  topAuthors: string[]
  reasons: string[]
}

const BOOK_PREVIEW_SELECT = 'id,title,authors,cover_image_url,kdc_class_nm,sector'

function mapBookRow(row: Record<string, unknown>): BookPreview {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    authors: String(row.authors ?? ''),
    coverImageUrl: String(row.cover_image_url ?? ''),
    kdcClassName: String(row.kdc_class_nm ?? ''),
    sector: Number(row.sector ?? 0),
  }
}

function mapBookRows(rows: unknown[] | null | undefined): BookPreview[] {
  return (rows ?? []).map((row) => mapBookRow(row as Record<string, unknown>))
}

function normalizedText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s\-_~.,!?()[\]{}'"`]/g, '')
    .trim()
}

function bigrams(input: string): Set<string> {
  if (input.length < 2) return new Set([input])
  const set = new Set<string>()
  for (let i = 0; i < input.length - 1; i += 1) {
    set.add(input.slice(i, i + 2))
  }
  return set
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const g1 = bigrams(a)
  const g2 = bigrams(b)
  let overlap = 0
  for (const token of g1) {
    if (g2.has(token)) overlap += 1
  }
  return (2 * overlap) / (g1.size + g2.size)
}

function startsWithBonus(q: string, title: string): number {
  if (!q || !title) return 0
  if (title.startsWith(q)) return 0.2
  if (title.includes(q)) return 0.1
  return 0
}

function parseWeightEntries(input: unknown): WeightEntry[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => ({ key, weight: Number(value) }))
    .filter((entry) => entry.key.length > 0 && Number.isFinite(entry.weight))
    .sort((a, b) => b.weight - a.weight)
}

function parseRecentActionsSummary(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 3)
}

function fallbackComputedAt(): string {
  return new Date(0).toISOString()
}

function toIsoString(input: unknown): string {
  if (typeof input !== 'string') return fallbackComputedAt()
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return fallbackComputedAt()
  return parsed.toISOString()
}

function profileStatusFrom(richness: number, computedAtIso: string): TasteRecommendationData['profileStatus'] {
  const staleCutoffMs = 7 * 24 * 60 * 60 * 1000
  const ageMs = Date.now() - new Date(computedAtIso).getTime()
  if (Number.isFinite(ageMs) && ageMs > staleCutoffMs) return 'stale'
  if (richness >= 0.7) return 'strong'
  if (richness >= 0.3) return 'mixed'
  return 'weak'
}

function genreBoost(kdcClassName: string, topGenres: string[], profileStatus: TasteRecommendationData['profileStatus']): number {
  if (profileStatus === 'strong' || topGenres.length === 0) return 0
  const haystack = normalizedText(kdcClassName)
  if (!haystack) return 0
  const matched = topGenres.some((genre) => haystack.includes(normalizedText(genre)))
  if (!matched) return 0
  return profileStatus === 'weak' ? 0.2 : 0.1
}

function excludeBookIdSet(excludeBookIds?: readonly string[]): Set<string> {
  const set = new Set<string>()
  if (!excludeBookIds) return set
  for (const id of excludeBookIds) {
    const t = typeof id === 'string' ? id.trim() : ''
    if (t.length > 0) set.add(t)
  }
  return set
}

/** 상위 정렬 목록에서 연속 호출마다 다른 limit개를 고르기 위한 슬라이딩 창. */
export type TasteRecommendationDiversity = {
  windowSize: number
  round: number
}

function bookSignatureKey(book: BookPreview): string {
  return `${normalizedText(book.title)}|${normalizedText(book.authors)}`
}

/**
 * ranked는 score 내림차순. 같은 books.id는 최고 점수 행만 유지하고,
 * 동일 제목·저자(정규화)인 다른 id 행은 첫 행만 유지한다.
 */
export function dedupeRankedBookEntries(
  ranked: { book: BookPreview; score: number }[],
): { book: BookPreview; score: number }[] {
  const seenIds = new Set<string>()
  const afterId: { book: BookPreview; score: number }[] = []
  for (const entry of ranked) {
    const id = entry.book.id.trim()
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    afterId.push(entry)
  }
  const seenSig = new Set<string>()
  const out: { book: BookPreview; score: number }[] = []
  for (const entry of afterId) {
    const sig = bookSignatureKey(entry.book)
    if (seenSig.has(sig)) continue
    seenSig.add(sig)
    out.push(entry)
  }
  return out
}

/** 순서를 유지한 채 id → 제목·저자 중복을 제거한다. */
export function dedupeBookPreviewList(books: BookPreview[]): BookPreview[] {
  const seenIds = new Set<string>()
  const afterId: BookPreview[] = []
  for (const book of books) {
    const id = book.id.trim()
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    afterId.push(book)
  }
  const seenSig = new Set<string>()
  const out: BookPreview[] = []
  for (const book of afterId) {
    const sig = bookSignatureKey(book)
    if (seenSig.has(sig)) continue
    seenSig.add(sig)
    out.push(book)
  }
  return out
}

function pickUniqueBookPreviews(
  books: BookPreview[],
  limit: number,
  exclude: Set<string>,
): BookPreview[] {
  const picked: BookPreview[] = []
  const seenIds = new Set<string>()
  const seenSig = new Set<string>()
  for (const book of books) {
    if (exclude.has(book.id)) continue
    const id = book.id.trim()
    if (!id || seenIds.has(id)) continue
    const sig = bookSignatureKey(book)
    if (seenSig.has(sig)) continue
    seenIds.add(id)
    seenSig.add(sig)
    picked.push(book)
    if (picked.length >= limit) break
  }
  return picked
}

export function pickDiverseSliceFromRanked(
  filteredRanked: { book: BookPreview; score: number }[],
  limit: number,
  diversity?: TasteRecommendationDiversity,
): BookPreview[] {
  if (filteredRanked.length === 0) return []
  if (!diversity || filteredRanked.length <= limit) {
    return filteredRanked.slice(0, limit).map((e) => e.book)
  }
  const M = Math.max(limit, Math.min(diversity.windowSize, filteredRanked.length))
  const window = filteredRanked.slice(0, M)
  if (window.length <= limit) {
    return window.map((e) => e.book)
  }
  const maxStart = window.length - limit
  const start = diversity.round % (maxStart + 1)
  return window.slice(start, start + limit).map((e) => e.book)
}

export async function fetchLocationRecommendations(
  limit = 3,
  excludeBookIds?: readonly string[],
): Promise<DbResult<BookPreview[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const exclude = excludeBookIdSet(excludeBookIds)
  const fetchCap = Math.max(limit * 10, 30)
  const { data, error } = await supabase
    .from('books')
    .select(BOOK_PREVIEW_SELECT)
    .order('sector', { ascending: true })
    .limit(fetchCap)
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: [] }
  const rows = mapBookRows(data)
  const picked = pickUniqueBookPreviews(rows, limit, exclude)
  return { ok: true, data: picked }
}

export async function fetchRatingRecommendations(
  limit = 3,
  excludeBookIds?: readonly string[],
): Promise<DbResult<BookPreview[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const { data: ratingsData, error: ratingsError } = await supabase
    .from('ratings')
    .select('books_id,score')
    .order('score', { ascending: false })
    .limit(50)
  if (ratingsError) return mapPostgrestError(ratingsError)
  if (!ratingsData) return { ok: true, data: [] }

  const orderedUniqueIds: string[] = []
  const seen = new Set<string>()
  for (const row of ratingsData) {
    const id = String((row as { books_id?: string }).books_id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    orderedUniqueIds.push(id)
    if (orderedUniqueIds.length >= 80) break
  }

  if (orderedUniqueIds.length === 0) return { ok: true, data: [] }
  const candidateIds = orderedUniqueIds.slice(0, 50)
  const { data: booksData, error: booksError } = await supabase
    .from('books')
    .select(BOOK_PREVIEW_SELECT)
    .in('id', candidateIds)
  if (booksError) return mapPostgrestError(booksError)
  if (!booksData) return { ok: true, data: [] }

  const bookMap = new Map<string, BookPreview>()
  for (const row of booksData) {
    const book = mapBookRow(row as Record<string, unknown>)
    bookMap.set(book.id, book)
  }
  const exclude = excludeBookIdSet(excludeBookIds)
  const orderedBooks = candidateIds
    .map((id) => bookMap.get(id))
    .filter((book): book is BookPreview => book !== undefined)
  const picked = pickUniqueBookPreviews(orderedBooks, limit, exclude)
  return { ok: true, data: picked }
}

export async function fetchUserTasteProfile(usersId: string): Promise<DbResult<TasteProfileSnapshot | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const normalizedUsersId = usersId.trim()
  if (!normalizedUsersId) return { ok: true, data: null }

  const { data, error } = await supabase
    .from('user_taste_profiles')
    .select(
      'users_id,seed_weights,genre_weights,author_weights,richness,action_count,unique_book_count,computed_at,recent_actions_summary',
    )
    .eq('users_id', normalizedUsersId)
    .maybeSingle()
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: null }

  return {
    ok: true,
    data: {
      usersId: String((data as { users_id?: unknown }).users_id ?? normalizedUsersId),
      seedWeights: parseWeightEntries((data as { seed_weights?: unknown }).seed_weights),
      genreWeights: parseWeightEntries((data as { genre_weights?: unknown }).genre_weights),
      authorWeights: parseWeightEntries((data as { author_weights?: unknown }).author_weights),
      richness: Number((data as { richness?: unknown }).richness ?? 0),
      actionCount: Number((data as { action_count?: unknown }).action_count ?? 0),
      uniqueBookCount: Number((data as { unique_book_count?: unknown }).unique_book_count ?? 0),
      computedAt: toIsoString((data as { computed_at?: unknown }).computed_at),
      recentActionsSummary: parseRecentActionsSummary(
        (data as { recent_actions_summary?: unknown }).recent_actions_summary,
      ),
    },
  }
}

export async function fetchTasteRecommendations(
  usersId: string,
  limit = 3,
  seedLimit = 20,
  excludeBookIds?: readonly string[],
  diversity?: TasteRecommendationDiversity,
): Promise<DbResult<TasteRecommendationData>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const exclude = excludeBookIdSet(excludeBookIds)
  const profileResult = await fetchUserTasteProfile(usersId)
  if (!profileResult.ok) return profileResult

  const profile = profileResult.data
  if (!profile) {
    const fallback = await fetchRatingRecommendations(limit, excludeBookIds)
    if (!fallback.ok) return fallback
    return {
      ok: true,
      data: {
        books: fallback.data,
        source: 'rating_fallback',
        profileStatus: 'none',
        richness: 0,
        computedAt: fallbackComputedAt(),
        topGenres: [],
        topAuthors: [],
        reasons: ['취향 프로필이 없어 인기/평점 기반 추천을 보여드려요.'],
      },
    }
  }

  const seedEntries = profile.seedWeights.slice(0, Math.max(10, Math.min(seedLimit, 30)))
  const topGenres = profile.genreWeights.slice(0, 3).map((entry) => entry.key)
  const topAuthors = profile.authorWeights.slice(0, 3).map((entry) => entry.key)
  const profileStatus = profileStatusFrom(profile.richness, profile.computedAt)
  const seedBookIds = seedEntries.map((entry) => entry.key).filter((id) => id.length > 0)

  if (seedBookIds.length === 0) {
    const fallback = await fetchRatingRecommendations(limit, excludeBookIds)
    if (!fallback.ok) return fallback
    return {
      ok: true,
      data: {
        books: fallback.data,
        source: 'rating_fallback',
        profileStatus,
        richness: profile.richness,
        computedAt: profile.computedAt,
        topGenres,
        topAuthors,
        reasons: ['시드 데이터가 부족해 인기/평점 기반 추천을 섞어 보여드려요.'],
      },
    }
  }

  const { data: seedBooksData, error: seedBooksError } = await supabase
    .from('books')
    .select(BOOK_PREVIEW_SELECT)
    .in('id', seedBookIds)
    .limit(Math.max(limit * 3, 12))
  if (seedBooksError) return mapPostgrestError(seedBooksError)
  const seedBooks = mapBookRows(seedBooksData)

  const maxSeedWeight = seedEntries[0]?.weight || 1
  const seedWeightMap = new Map(seedEntries.map((entry) => [entry.key, entry.weight / maxSeedWeight]))

  const { data: ratingsData, error: ratingsError } = await supabase
    .from('ratings')
    .select('books_id,score')
    .in('books_id', seedBookIds)
    .limit(200)
  if (ratingsError) return mapPostgrestError(ratingsError)

  const ratingMap = new Map<string, { sum: number; count: number }>()
  for (const row of ratingsData ?? []) {
    const booksId = String((row as { books_id?: unknown }).books_id ?? '')
    const score = Number((row as { score?: unknown }).score ?? 0)
    if (!booksId || !Number.isFinite(score)) continue
    const prev = ratingMap.get(booksId) ?? { sum: 0, count: 0 }
    prev.sum += score
    prev.count += 1
    ratingMap.set(booksId, prev)
  }

  const ranked = seedBooks
    .map((book) => {
      const seedSimilarity = seedWeightMap.get(book.id) ?? 0
      const ratingInfo = ratingMap.get(book.id)
      const baseScore = ratingInfo && ratingInfo.count > 0 ? Math.min(1, ratingInfo.sum / ratingInfo.count / 5) : 0.5
      const boost = genreBoost(book.kdcClassName, topGenres, profileStatus)
      const a = profileStatus === 'strong' ? 0.3 : 0.4
      const b = profileStatus === 'strong' ? 0.7 : 0.6
      const finalScore = baseScore * a + seedSimilarity * b + boost
      return { book, score: finalScore }
    })
    .sort((lhs, rhs) => rhs.score - lhs.score)

  const dedupedRanked = dedupeRankedBookEntries(ranked)
  const filteredRanked = dedupedRanked.filter((entry) => !exclude.has(entry.book.id))
  const picked = pickDiverseSliceFromRanked(filteredRanked, limit, diversity)
  if (picked.length === 0) {
    const locationFallback = await fetchLocationRecommendations(limit, excludeBookIds)
    if (!locationFallback.ok) return locationFallback
    return {
      ok: true,
      data: {
        books: locationFallback.data,
        source: 'location_fallback',
        profileStatus,
        richness: profile.richness,
        computedAt: profile.computedAt,
        topGenres,
        topAuthors,
        reasons: ['후보가 부족해 위치 기반 추천을 함께 보여드려요.'],
      },
    }
  }

  const reasons = [...profile.recentActionsSummary]
  if (topGenres.length > 0) reasons.push(`관심 장르: ${topGenres.join(', ')}`)
  if (topAuthors.length > 0) reasons.push(`관심 작가: ${topAuthors.join(', ')}`)
  if (profileStatus === 'stale') reasons.push('취향 반영 시각이 오래되어 추천 가중치를 일부 감쇠했어요.')

  return {
    ok: true,
    data: {
      books: picked,
      source: 'taste',
      profileStatus,
      richness: profile.richness,
      computedAt: profile.computedAt,
      topGenres,
      topAuthors,
      reasons: reasons.slice(0, 3),
    },
  }
}

export async function findBookByIsbnOrTitle(input: {
  isbn13?: string
  title?: string
}): Promise<DbResult<BookPreview | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const isbn = input.isbn13?.trim()
  if (isbn) {
    const { data, error } = await supabase
      .from('books')
      .select(BOOK_PREVIEW_SELECT)
      .eq('id', isbn)
      .maybeSingle()
    if (error) return mapPostgrestError(error)
    if (data) return { ok: true, data: mapBookRow(data as Record<string, unknown>) }
  }

  const title = input.title?.trim()
  if (title) {
    const { data, error } = await supabase
      .from('books')
      .select(BOOK_PREVIEW_SELECT)
      .ilike('title', `%${title}%`)
      .limit(1)
    if (error) return mapPostgrestError(error)
    if (data && data.length > 0) {
      return { ok: true, data: mapBookRow(data[0] as Record<string, unknown>) }
    }
  }

  return { ok: true, data: null }
}

export async function findBookCandidatesByTitle(
  titleQuery: string,
  limit = 5,
): Promise<DbResult<BookMatchCandidate[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const query = titleQuery.trim()
  if (!query) return { ok: true, data: [] }

  const normalizedQuery = normalizedText(query)
  if (!normalizedQuery) return { ok: true, data: [] }

  const partialToken = query.slice(0, Math.min(query.length, 6))
  const { data, error } = await supabase
    .from('books')
    .select(BOOK_PREVIEW_SELECT)
    .or(`title.ilike.%${query}%,title.ilike.%${partialToken}%`)
    .limit(20)
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: [] }

  const ranked = mapBookRows(data)
    .map((book) => {
      const normalizedTitle = normalizedText(book.title)
      const score = Math.min(1, diceCoefficient(normalizedQuery, normalizedTitle) + startsWithBonus(normalizedQuery, normalizedTitle))
      return { book, score }
    })
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 10)))

  return { ok: true, data: ranked }
}

export async function searchBooksByTitle(query: string, limit = 5): Promise<DbResult<BookPreview[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const normalized = query.trim()
  if (!normalized) return { ok: true, data: [] }

  const { data, error } = await supabase
    .from('books')
    .select(BOOK_PREVIEW_SELECT)
    .ilike('title', `%${normalized}%`)
    .limit(Math.max(1, Math.min(limit, 10)))
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: [] }
  return { ok: true, data: mapBookRows(data) }
}
