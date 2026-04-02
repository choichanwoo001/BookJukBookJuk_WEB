import {
  wallRects as rawWallRects,
  bookshelfRects as rawBookshelfRects,
  bookshelfInstances as rawBookshelfInstances,
  pillarRects as rawPillarRects,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  mapWidth,
  mapDepth,
  MAP_RESOLUTION,
} from './mapData'
import type { WallRect, BookshelfInstance } from './mapData'
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

type RectZone = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const BOOKSHELF_REMOVE_ZONES: RectZone[] = [
  // User flagged bookshelf/desk around this coordinate as invalid.
  { minX: -1.8, maxX: -0.2, minZ: 10.2, maxZ: 11.6 },
]

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

function isInsideZone(x: number, z: number, zone: RectZone) {
  return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ
}

function isInAnyZone(x: number, z: number, zones: RectZone[]) {
  return zones.some(zone => isInsideZone(x, z, zone))
}

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
export const bookshelfRects = rawBookshelfRects.filter(
  rect => !isInAnyZone(rect.cx, rect.cz, BOOKSHELF_REMOVE_ZONES),
)
export const bookshelfInstances = rawBookshelfInstances.filter(
  item => !isInAnyZone(item.cx, item.cz, BOOKSHELF_REMOVE_ZONES),
)
export const pillarRects = rawPillarRects
export const wallPolylines = [
  ...rawWallPolylines.filter(loop => loop.length >= 3),
  ...MANUAL_WALL_PATCH_LOOPS,
]
export const wallHolePolylines = rawWallHolePolylines.filter(loop => loop.length >= 3)

// Manual fixture placements gathered from 3D map click annotations.
// yaw uses radians.
export const manualFixtureInstances: ManualFixtureInstance[] = []

export const counterInstances = manualFixtureInstances.filter(v => v.kind === 'counter')
export const displayLowInstances = manualFixtureInstances.filter(v => v.kind === 'displayLow')
export const manualBookshelfInstances = manualFixtureInstances.filter(v => v.kind === 'bookshelf')
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
