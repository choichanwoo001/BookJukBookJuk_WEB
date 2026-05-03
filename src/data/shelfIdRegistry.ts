/**
 * Stable shelf identifiers by geographic sort (cz asc, cx asc) over mapData bookshelves.
 * Used for nearest lookup when matching coordinates; primary IDs are attached in floorPlan.
 */
export type ShelfRegistryEntry = { id: string; cx: number; cz: number }

/** 39 shelves — same order as cz→cx sort of raw map bookshelves (`shelf_018`·`shelf_022` 제외). */
export const SHELF_REGISTRY: ShelfRegistryEntry[] = [
  { id: 'shelf_001', cx: -7.688, cz: -16.595 },
  { id: 'shelf_002', cx: -4.622, cz: -15.492 },
  { id: 'shelf_003', cx: -8.4, cz: -14.438 },
  { id: 'shelf_004', cx: -5.557, cz: -13.424 },
  { id: 'shelf_005', cx: -15.099, cz: -13.367 },
  { id: 'shelf_006', cx: -13.278, cz: -12.599 },
  { id: 'shelf_007', cx: 4.858, cz: -11.724 },
  { id: 'shelf_008', cx: -16.144, cz: -10.496 },
  { id: 'shelf_009', cx: 8.935, cz: -10.346 },
  { id: 'shelf_010', cx: -14.307, cz: -9.814 },
  { id: 'shelf_011', cx: -1.112, cz: -7.811 },
  { id: 'shelf_012', cx: -0.012, cz: -7.411 },
  { id: 'shelf_013', cx: 10.123, cz: -7.212 },
  { id: 'shelf_014', cx: 13.065, cz: -5.885 },
  { id: 'shelf_015', cx: 19.309, cz: -5.737 },
  { id: 'shelf_016', cx: -2.012, cz: -5.461 },
  { id: 'shelf_017', cx: -0.862, cz: -5.111 },
  { id: 'shelf_019', cx: -12.978, cz: -4.429 },
  { id: 'shelf_020', cx: 17.508, cz: -4.002 },
  { id: 'shelf_021', cx: -8.763, cz: -2.962 },
  { id: 'shelf_023', cx: 20.989, cz: -2.461 },
  { id: 'shelf_024', cx: 29.006, cz: -1.479 },
  { id: 'shelf_025', cx: 25.932, cz: -0.387 },
  { id: 'shelf_026', cx: -18.656, cz: 1.366 },
  { id: 'shelf_027', cx: 30.537, cz: 1.607 },
  { id: 'shelf_028', cx: 38.55, cz: 2.677 },
  { id: 'shelf_029', cx: -5.155, cz: 2.896 },
  { id: 'shelf_030', cx: -3.941, cz: 4.166 },
  { id: 'shelf_031', cx: -21.898, cz: 4.187 },
  { id: 'shelf_032', cx: -5.855, cz: 4.746 },
  { id: 'shelf_033', cx: 43.62, cz: 4.814 },
  { id: 'shelf_034', cx: 39.645, cz: 5.575 },
  { id: 'shelf_035', cx: -6.869, cz: 9.916 },
  { id: 'shelf_036', cx: -9.419, cz: 12.016 },
  { id: 'shelf_037', cx: 3.477, cz: 12.599 },
  { id: 'shelf_038', cx: -6.419, cz: 13.116 },
  { id: 'shelf_039', cx: 1.884, cz: 13.581 },
  { id: 'shelf_040', cx: 0.96, cz: 15.792 },
  { id: 'shelf_041', cx: 1.544, cz: 18.009 },
]

const MATCH_EPS_M = 0.35

/** Nearest registry id if within MATCH_EPS_M; otherwise null. */
export function nearestShelfId(cx: number, cz: number): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const e of SHELF_REGISTRY) {
    const d = Math.hypot(e.cx - cx, e.cz - cz)
    if (d < bestD) {
      bestD = d
      best = e.id
    }
  }
  if (best === null || bestD > MATCH_EPS_M) return null
  return best
}
