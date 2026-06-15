import {
  wallRects as rawWallRects,
  pillarRects as rawPillarRects,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  mapWidth, mapDepth, MAP_RESOLUTION,
} from './mapData'
import type { WallRect, BookshelfInstance } from './mapData'
import { detectedFixtures } from './detectedFixtures'
import { axisAlignedBoundsForRotatedBookshelf } from '../utils/bookshelfCollision'
import { createRectPointIndex, pointInAnyRect } from '../utils/rectUtils'
import { robotMapStartWorldXz } from '../lib/verso/robotMissionCoords'

export type Point2 = [number, number]

export const FLOOR_HEIGHT_M = 3
export const WALL_THICKNESS_M = 0.16
export const FLOOR_RENDER_PADDING_M = MAP_RESOLUTION * 4
export const FLOOR_INCLUSION_PADDING_M = MAP_RESOLUTION * 2.5
/** 1.65m 기준 반경 0.24m를 키 1.55m에 비례 축소. */
export const PLAYER_RADIUS_M = 0.24 * (1.55 / 1.65)

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

export type RuntimeFixtureInstance = ManualFixtureInstance

/** Entrance spawn point in world xz (m). */
export const ENTRANCE_SPAWN_RADIUS_M = 0.35
export const ENTRANCE_SPAWN: Point2 = robotMapStartWorldXz()

export const SPAWN_FLOOR_PATCH_RECTS: WallRect[] = pointInAnyRect(rawFloorRects, ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1])
  ? []
  : [{
    cx: ENTRANCE_SPAWN[0],
    cz: ENTRANCE_SPAWN[1],
    w: ENTRANCE_SPAWN_RADIUS_M * 2,
    d: ENTRANCE_SPAWN_RADIUS_M * 2,
  }]

// Thin rectangular wall-patch loops appended to wallPolylines.
// WallRibbonMesh renders these as proper wall-height panels — no separate box geometry.
// Each entry is a 4-point closed loop: wall-thickness wide, ~0.7 m long.
// Coordinate values: t = WALL_THICKNESS_M/2 = 0.08
export const MANUAL_WALL_PATCH_LOOPS: [number, number][][] = []


export const wallRects = rawWallRects
export const wallRenderRects = wallRects
export const floorFillRects: WallRect[] = []
export const floorRenderRects = rawFloorRects
export const floorRects = rawFloorRects
export const pillarRects = rawPillarRects
export const wallPolylines = rawWallPolylines.filter(loop => loop.length >= 3)
export const wallHolePolylines = rawWallHolePolylines.filter(loop => loop.length >= 3)

// Photo / measured placements (persist here; merged with detected fixtures).
// yaw radians; w,d meters; h shelf height.
const MANUAL_BOOKSHELF_H = FLOOR_HEIGHT_M * 0.78
export const COUNTER_H = 1.1
const DISPLAY_LOW_H = 0.9

const DEFAULT_HEIGHT_BY_KIND: Record<FixtureKind, number> = {
  bookshelf: MANUAL_BOOKSHELF_H,
  counter: COUNTER_H,
  displayLow: DISPLAY_LOW_H,
}

// 계산대는 기본 맵 레이어가 아니라 bookshelves overlay 레이어에서 관리한다.
export const manualFixtureInstances: ManualFixtureInstance[] = []

export const manualBookshelfInstances = manualFixtureInstances.filter(v => v.kind === 'bookshelf')

function areSimilarFixtures(a: RuntimeFixtureInstance, b: RuntimeFixtureInstance) {
  if (a.kind !== b.kind) return false
  const centerDistance = Math.hypot(a.cx - b.cx, a.cz - b.cz)
  if (centerDistance > 0.75) return false
  const areaA = a.w * a.d
  const areaB = b.w * b.d
  const areaRatio = areaA > areaB ? areaA / areaB : areaB / areaA
  return areaRatio <= 1.5
}

function mergeFixtures(preferred: RuntimeFixtureInstance[], overrides: RuntimeFixtureInstance[]) {
  const merged = [...preferred]
  for (const candidate of overrides) {
    const dupIdx = merged.findIndex(current => areSimilarFixtures(current, candidate))
    if (dupIdx >= 0) merged[dupIdx] = candidate
    else merged.push(candidate)
  }
  return merged
}

const detectedFixtureInstances: RuntimeFixtureInstance[] = detectedFixtures.map((fixture) => {
  const kind = fixture.kind
  return {
    kind,
    cx: fixture.cx,
    cz: fixture.cz,
    w: fixture.w,
    d: fixture.d,
    yaw: fixture.yaw,
    h: fixture.h ?? DEFAULT_HEIGHT_BY_KIND[kind],
  }
})

export const fixtureInstances: RuntimeFixtureInstance[] = mergeFixtures(detectedFixtureInstances, manualFixtureInstances)
export const bookshelfInstanceModels = fixtureInstances.filter(v => v.kind === 'bookshelf')
export const counterInstances = fixtureInstances.filter(v => v.kind === 'counter')
export const displayLowInstances = fixtureInstances.filter(v => v.kind === 'displayLow')
export const bookshelfInstances: BookshelfInstance[] = bookshelfInstanceModels.map((s) => ({
  cx: s.cx,
  cz: s.cz,
  w: s.w,
  d: s.d,
  yaw: s.yaw,
}))
export const bookshelfRects: WallRect[] = bookshelfInstances.map((s) => ({
  cx: s.cx,
  cz: s.cz,
  w: s.w,
  d: s.d,
}))

/** Oriented AABB from merged bookshelf fixtures (player collision). */
export const allBookshelfCollisionRects: WallRect[] = [
  ...bookshelfInstances.map(m =>
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

const floorContainsPoint = createRectPointIndex(floorRects)

export function isOnFloor(x: number, z: number): boolean {
  return floorContainsPoint(x, z, FLOOR_INCLUSION_PADDING_M)
}

export const SPAWN_POINT_WORLD: Point2 = ENTRANCE_SPAWN
