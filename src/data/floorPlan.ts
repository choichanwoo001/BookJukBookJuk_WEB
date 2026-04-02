import {
  wallRects as rawWallRects,
  pillarRects as rawPillarRects,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  mapWidth,
  mapDepth,
  MAP_RESOLUTION,
} from './mapData'
import type { WallRect, BookshelfInstance } from './mapData'
import { axisAlignedBoundsForRotatedBookshelf } from '../utils/bookshelfCollision'
import { pointInAnyRect } from '../utils/rectUtils'

export type Point2 = [number, number]

export const FLOOR_HEIGHT_M = 3
export const WALL_THICKNESS_M = 0.16
export const PLAYER_RADIUS_M = 0.24

export type FixtureKind = 'bookshelf' | 'counter' | 'displayLow'

export type ManualFixtureInstance = {
  kind: FixtureKind
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
}

const MANUAL_FLOOR_FILL_RECTS: WallRect[] = [
  // Floor fill near center (x=-2.938, z=8.543).
  { cx: -2.938, cz: 8.543, w: 1.327, d: 3.3 },
  // Two point-only reports: small local fill squares.
  { cx: -4.671, cz: 3.952, w: 0.6, d: 0.6 },
  { cx: -5.201, cz: 3.091, w: 0.6, d: 0.6 },
  // Floor fill near center (x=-11.874, z=12.400).
  { cx: -11.874, cz: 12.4, w: 1.008, d: 2.571 },
  // Floor gap at (-2.440, 10.540) — just past the top edge of the region above.
  { cx: -2.440, cz: 10.540, w: 0.80, d: 0.80 },
  // Floor-wall junction gaps (surface=wall but y≈0 → floor not reaching wall).
  { cx: -3.643, cz: 6.905, w: 0.50, d: 0.50 },
  { cx: -5.583, cz: 3.366, w: 0.50, d: 0.50 },
]

// Thin rectangular wall-patch loops appended to wallPolylines.
// WallRibbonMesh renders these as proper wall-height panels — no separate box geometry.
// Each entry is a 4-point closed loop: wall-thickness wide, ~0.7 m long.
// Coordinate values: t = WALL_THICKNESS_M/2 = 0.08
const MANUAL_WALL_PATCH_LOOPS: [number, number][][] = []

function normalizeWallThickness(rects: WallRect[], thickness: number): WallRect[] {
  return rects.map((r) => {
    if (r.w <= 0 || r.d <= 0) return r
    if (r.w > r.d) return { ...r, d: thickness }
    if (r.d > r.w) return { ...r, w: thickness }
    return { ...r, w: thickness, d: thickness }
  })
}

export const wallRects = normalizeWallThickness(rawWallRects, WALL_THICKNESS_M)
export const floorFillRects = MANUAL_FLOOR_FILL_RECTS
export const floorRects = [...rawFloorRects, ...MANUAL_FLOOR_FILL_RECTS]
export const bookshelfRects: WallRect[] = []
export const bookshelfInstances: BookshelfInstance[] = []
export const pillarRects = rawPillarRects
export const wallPolylines = [
  ...rawWallPolylines.filter(loop => loop.length >= 3),
  ...MANUAL_WALL_PATCH_LOOPS,
]
export const wallHolePolylines = rawWallHolePolylines.filter(loop => loop.length >= 3)

// Photo / measured placements (persist here; map pipeline `bookshelfInstances` stays empty).
// yaw radians; w,d meters; h shelf height.
const MANUAL_BOOKSHELF_H = FLOOR_HEIGHT_M * 0.78

export const manualFixtureInstances: ManualFixtureInstance[] = [
  {
    kind: 'bookshelf',
    cx: -7.169,
    cz: 14.413,
    w: 1.758,
    d: 0.745,
    yaw: -0.4103,
    h: MANUAL_BOOKSHELF_H,
  },
  {
    kind: 'bookshelf',
    cx: -13.369,
    cz: 13.338,
    w: 1.74,
    d: 0.697,
    yaw: 1.1605,
    h: MANUAL_BOOKSHELF_H,
  },
]

export const counterInstances = manualFixtureInstances.filter(v => v.kind === 'counter')
export const displayLowInstances = manualFixtureInstances.filter(v => v.kind === 'displayLow')
export const manualBookshelfInstances = manualFixtureInstances.filter(v => v.kind === 'bookshelf')

/** Map-derived rects + oriented AABB from manual shelves (player collision). */
export const allBookshelfCollisionRects: WallRect[] = [
  ...bookshelfRects,
  ...manualBookshelfInstances.map(m =>
    axisAlignedBoundsForRotatedBookshelf(m.cx, m.cz, m.w, m.d, m.yaw),
  ),
]

export { mapWidth, mapDepth, MAP_RESOLUTION }
export type { WallRect, BookshelfInstance }

export function computeFloorCenter(): Point2 {
  if (floorRects.length === 0) return [0, 0]
  let sx = 0, sz = 0, totalArea = 0
  for (const r of floorRects) {
    const area = r.w * r.d
    sx += r.cx * area
    sz += r.cz * area
    totalArea += area
  }
  return [sx / totalArea, sz / totalArea]
}

export function isOnFloor(x: number, z: number): boolean {
  return pointInAnyRect(floorRects, x, z)
}

export const SPAWN_POINT_WORLD: Point2 = computeFloorCenter()
