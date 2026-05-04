/**
 * 실제 책장(서가)이 아니라 낮은 진열대(상판 전시대)로 취급할 shelf id 목록.
 * - sector 배정/DB bookshelves 시드 대상에서 제외
 * - 3D에서는 displayShelf 전용 메쉬 + 상판 가상 책 렌더 대상
 */
export const DISPLAY_SHELF_ROWS = [
  { id: 'shelf_019', h: 1.05 },
  { id: 'shelf_021', h: 1.05 },
  { id: 'shelf_029', h: 0.98 },
  { id: 'shelf_032', h: 0.98 },
  { id: 'shelf_035', h: 1.08 },
  { id: 'shelf_036', h: 1.08 },
  { id: 'shelf_038', h: 1.08 },
  { id: 'shelf_039', h: 0.98 },
  { id: 'shelf_040', h: 0.98 },
] as const

export const DISPLAY_SHELF_IDS = new Set<string>(DISPLAY_SHELF_ROWS.map((row) => row.id))

const DISPLAY_SHELF_HEIGHT_BY_ID = new Map<string, number>(
  DISPLAY_SHELF_ROWS.map((row) => [row.id, row.h]),
)

export function isDisplayShelfId(id: string | null | undefined): boolean {
  return !!id && DISPLAY_SHELF_IDS.has(id)
}

export function getDisplayShelfHeightById(id: string | null | undefined): number | undefined {
  if (!id) return undefined
  return DISPLAY_SHELF_HEIGHT_BY_ID.get(id)
}
