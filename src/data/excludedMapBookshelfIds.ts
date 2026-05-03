/**
 * Keepout 등 맵 장애물로는 남지만 게임에서 책장(선택·미션·시드)으로 취급하지 않는 shelf_id.
 * 맵 재생성 시 동일 목록: `scripts/processMap.mjs` 의 `KEEPOUT_EXCLUDE_BOOKSHELF_IDS`.
 */
export const EXCLUDED_MAP_BOOKSHELF_IDS = new Set<string>(['shelf_018', 'shelf_022'])

/** `SHELF_REGISTRY`에서 id를 뺀 뒤에도 동일 위치는 책장으로 남지 않도록 world 기준으로 제외 */
export const EXCLUDED_MAP_BOOKSHELF_CENTERS: Array<{ cx: number; cz: number }> = [
  { cx: -6.689, cz: -4.449 },
  { cx: -14.371, cz: -2.93 },
]

const EXCLUDED_CENTER_EPS_M = 0.5

export function isExcludedMapBookshelfPosition(cx: number, cz: number, nearestRegistryId: string | null): boolean {
  if (nearestRegistryId && EXCLUDED_MAP_BOOKSHELF_IDS.has(nearestRegistryId)) return true
  return EXCLUDED_MAP_BOOKSHELF_CENTERS.some((p) => Math.hypot(p.cx - cx, p.cz - cz) <= EXCLUDED_CENTER_EPS_M)
}
