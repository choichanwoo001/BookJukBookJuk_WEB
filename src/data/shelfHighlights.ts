export type ShelfHighlightKind =
  | 'wishlist'
  | 'hot'
  | 'highRating'
  | 'tasteMatch'
  | 'socialProof'

/** 뱃지 나열 순서 (다중 표시 시 동일 순서 유지) */
export const SHELF_HIGHLIGHT_ORDER: readonly ShelfHighlightKind[] = [
  'wishlist',
  'hot',
  'highRating',
  'tasteMatch',
  'socialProof',
] as const

export const SHELF_HIGHLIGHT_META: Record<
  ShelfHighlightKind,
  { emoji: string; labelKo: string }
> = {
  wishlist: { emoji: '❤️', labelKo: '찜한 목록' },
  hot: { emoji: '🔥', labelKo: 'HOT 랭킹' },
  highRating: { emoji: '🌟', labelKo: '평균 별점이 높은 작품' },
  tasteMatch: { emoji: '🎯', labelKo: '유저 취향 저격' },
  socialProof: { emoji: '👥', labelKo: '팔로우한 사람들이 높게 평가한 작품' },
}

export type ShelfHighlightFlagsMap = ReadonlyMap<string, ReadonlySet<ShelfHighlightKind>>

export function orderedHighlightKindsForShelf(
  flags: ShelfHighlightFlagsMap,
  shelfId: string | undefined,
): ShelfHighlightKind[] {
  if (!shelfId) return []
  const set = flags.get(shelfId)
  if (!set || set.size === 0) return []
  return SHELF_HIGHLIGHT_ORDER.filter((k) => set.has(k))
}
