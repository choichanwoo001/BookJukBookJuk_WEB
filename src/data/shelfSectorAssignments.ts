/**
 * One shelf = one sector (KDC 대분류 0–9). Edit `sector` after tagging in the editor, then re-export from the panel.
 *
 * Default: geographic order shelves 1–41 → sectors 0–9 with four shelves each except sector 9 (five shelves).
 */

export type ShelfSectorAssignmentRow = {
  id: string
  /** KDC 대분류 인덱스 0–9 */
  sector: number
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
}

/** shelf_001..004 → 0, shelf_005..008 → 1, … shelf_037..041 → 9 */
function defaultSectorForShelfIndex(index1Based: number): number {
  if (index1Based <= 4) return 0
  if (index1Based <= 8) return 1
  if (index1Based <= 12) return 2
  if (index1Based <= 16) return 3
  if (index1Based <= 20) return 4
  if (index1Based <= 24) return 5
  if (index1Based <= 28) return 6
  if (index1Based <= 32) return 7
  if (index1Based <= 36) return 8
  return 9
}

const raw: Omit<ShelfSectorAssignmentRow, 'sector'>[] = [
  { id: 'shelf_001', cx: -7.688, cz: -16.595, w: 2.19, d: 0.571, yaw: -0.3486 },
  { id: 'shelf_002', cx: -4.622, cz: -15.492, w: 2.9, d: 0.701, yaw: -0.3559 },
  { id: 'shelf_003', cx: -8.4, cz: -14.438, w: 2.105, d: 0.598, yaw: -0.3456 },
  { id: 'shelf_004', cx: -5.557, cz: -13.424, w: 2.308, d: 0.599, yaw: -0.3562 },
  { id: 'shelf_005', cx: -15.099, cz: -13.367, w: 2.15, d: 0.707, yaw: 1.2348 },
  { id: 'shelf_006', cx: -13.278, cz: -12.599, w: 2.197, d: 0.678, yaw: 1.2034 },
  { id: 'shelf_007', cx: 4.858, cz: -11.724, w: 4.406, d: 1.1, yaw: -0.3533 },
  { id: 'shelf_008', cx: -16.144, cz: -10.496, w: 2.2, d: 0.671, yaw: 1.2029 },
  { id: 'shelf_009', cx: 8.935, cz: -10.346, w: 2.584, d: 0.697, yaw: -0.3658 },
  { id: 'shelf_010', cx: -14.307, cz: -9.814, w: 2.147, d: 0.673, yaw: 1.2211 },
  { id: 'shelf_011', cx: -1.112, cz: -7.811, w: 1.695, d: 0.63, yaw: 1.2202 },
  { id: 'shelf_012', cx: -0.012, cz: -7.411, w: 1.695, d: 0.63, yaw: 1.2202 },
  { id: 'shelf_013', cx: 10.123, cz: -7.212, w: 3.458, d: 0.639, yaw: -0.3944 },
  { id: 'shelf_014', cx: 13.065, cz: -5.885, w: 1.835, d: 0.802, yaw: -0.4369 },
  { id: 'shelf_015', cx: 19.309, cz: -5.737, w: 6.773, d: 0.726, yaw: -0.3999 },
  { id: 'shelf_016', cx: -2.012, cz: -5.461, w: 1.695, d: 0.63, yaw: 1.2202 },
  { id: 'shelf_017', cx: -0.862, cz: -5.111, w: 1.695, d: 0.63, yaw: 1.2202 },
  { id: 'shelf_018', cx: -6.689, cz: -4.449, w: 2.186, d: 0.248, yaw: -0.3425 },
  { id: 'shelf_019', cx: -12.978, cz: -4.429, w: 3.416, d: 1.25, yaw: -0.3182 },
  { id: 'shelf_020', cx: 17.508, cz: -4.002, w: 1.726, d: 0.727, yaw: -0.4254 },
  { id: 'shelf_021', cx: -8.763, cz: -2.962, w: 3.067, d: 1.3, yaw: -0.31 },
  { id: 'shelf_022', cx: -14.371, cz: -2.93, w: 2.171, d: 0.297, yaw: -0.3355 },
  { id: 'shelf_023', cx: 20.989, cz: -2.461, w: 1.766, d: 0.8, yaw: -0.4161 },
  { id: 'shelf_024', cx: 29.006, cz: -1.479, w: 7.05, d: 0.599, yaw: -0.4127 },
  { id: 'shelf_025', cx: 25.932, cz: -0.387, w: 2.637, d: 0.731, yaw: -0.4082 },
  { id: 'shelf_026', cx: -18.656, cz: 1.366, w: 3.989, d: 0.674, yaw: 1.2405 },
  { id: 'shelf_027', cx: 30.537, cz: 1.607, w: 2.618, d: 0.702, yaw: -0.4151 },
  { id: 'shelf_028', cx: 38.55, cz: 2.677, w: 5.916, d: 0.604, yaw: -0.4112 },
  { id: 'shelf_029', cx: -5.155, cz: 2.896, w: 1.463, d: 1.424, yaw: 1.1707 },
  { id: 'shelf_030', cx: -3.941, cz: 4.166, w: 3.337, d: 0.619, yaw: 1.2377 },
  { id: 'shelf_031', cx: -21.898, cz: 4.187, w: 4.843, d: 0.679, yaw: 1.2147 },
  { id: 'shelf_032', cx: -5.855, cz: 4.746, w: 1.463, d: 1.424, yaw: 1.1707 },
  { id: 'shelf_033', cx: 43.62, cz: 4.814, w: 2.63, d: 0.865, yaw: -0.4051 },
  { id: 'shelf_034', cx: 39.645, cz: 5.575, w: 8.193, d: 0.561, yaw: -0.4198 },
  { id: 'shelf_035', cx: -6.869, cz: 9.916, w: 2.394, d: 2.327, yaw: -0.4348 },
  { id: 'shelf_036', cx: -9.419, cz: 12.016, w: 2.394, d: 2.327, yaw: -0.4348 },
  { id: 'shelf_037', cx: 3.477, cz: 12.599, w: 3.416, d: 1.952, yaw: -1.2068 },
  { id: 'shelf_038', cx: -6.419, cz: 13.116, w: 2.394, d: 2.327, yaw: -0.4348 },
  { id: 'shelf_039', cx: 1.884, cz: 13.581, w: 1.579, d: 1.522, yaw: 1.3171 },
  { id: 'shelf_040', cx: 0.96, cz: 15.792, w: 1.532, d: 1.369, yaw: -0.4174 },
  { id: 'shelf_041', cx: 1.544, cz: 18.009, w: 3.427, d: 2.068, yaw: 0.4753 },
]

export const SHELF_SECTOR_ASSIGNMENTS: ShelfSectorAssignmentRow[] = raw.map((row, i) => ({
  ...row,
  sector: defaultSectorForShelfIndex(i + 1),
}))

const byId = new Map(SHELF_SECTOR_ASSIGNMENTS.map((r) => [r.id, r]))

export function getShelfRowById(id: string): ShelfSectorAssignmentRow | undefined {
  return byId.get(id)
}

export function getShelfXzById(id: string): [number, number] | null {
  const r = byId.get(id)
  return r ? [r.cx, r.cz] : null
}

export function getShelfIdsBySector(sector: number): string[] {
  return SHELF_SECTOR_ASSIGNMENTS.filter((r) => r.sector === sector).map((r) => r.id)
}

export function getSectorByShelfId(id: string): number | undefined {
  return byId.get(id)?.sector
}

/** Ten distinct hues for edit-mode tint (hex). */
export const SECTOR_TINT_HEX: readonly string[] = [
  '#8ecae6',
  '#219ebc',
  '#023047',
  '#ffb703',
  '#fb8500',
  '#9b5de5',
  '#f15bb5',
  '#fee440',
  '#00bbf9',
  '#00f5d4',
]
