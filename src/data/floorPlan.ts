import {
  wallRects as rawWallRects,
  pillarRects as rawPillarRects,
  bookshelfInstances as rawBookshelfInstances,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  bookshelfPolygons as rawBookshelfPolygons,
  mapWidth, mapDepth, MAP_RESOLUTION,
} from './mapData'
import type { WallRect, BookshelfInstance } from './mapData'
import { detectedFixtures } from './detectedFixtures'
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

export type RuntimeFixtureInstance = ManualFixtureInstance

/** 입구(스폰 기준) 월드 xz (m). */
export const ENTRANCE_SPAWN: Point2 = [1.46, -1.71]

/**
 * 벽 표면에 얹는 문 장식(맵 폴리라인·내부 구조 미수정).
 * circle-area | surface=wall | center=(1.729, 0.017, -1.407) | radius=0.35 기준으로
 * 중심을 맞추고, 인접 벽 모서리 `[1.256,-2.737]`→`[5.081,7.338]` 접선에 정렬한다.
 */
export const ENTRANCE_DOORWAY = {
  centerX: 1.729,
  centerZ: -1.407,
  tangentX: 3.825,
  tangentZ: 10.075,
  /** 원 지름(0.7m)에 맞춘 개구 폭. */
  openingWidthM: 0.72,
  frameHeightM: 2.38,
  jambThicknessM: 0.09,
  frameDepthM: 0.14,
  lintelHeightM: 0.11,
  doorPanelWidthM: 0.66,
  doorOpenRad: 0.4,
} as const

/**
 * Runtime-only floor quads merged into `floorRects` for walk mesh / spawn overlap.
 * They are not produced from the occupancy PGM; exclude when validating “map file only” geometry.
 * Regenerate base rects with `node scripts/processMap.mjs` (optional `--raw-map`, `--dump-classified-pgm`).
 */
const MANUAL_FLOOR_FILL_RECTS: WallRect[] = []

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
export const pillarRects = rawPillarRects
export const wallPolylines = [
  ...rawWallPolylines.filter(loop => loop.length >= 3),
  ...MANUAL_WALL_PATCH_LOOPS,
]
export const wallHolePolylines = rawWallHolePolylines.filter(loop => loop.length >= 3)
export const bookshelfPolygons = rawBookshelfPolygons.filter(loop => loop.length >= 3)

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

const mapBookshelfInstances: RuntimeFixtureInstance[] = rawBookshelfInstances.map((fixture) => ({
  kind: 'bookshelf',
  cx: fixture.cx,
  cz: fixture.cz,
  w: fixture.w,
  d: fixture.d,
  yaw: fixture.yaw,
  h: MANUAL_BOOKSHELF_H,
}))

export const fixtureInstances: RuntimeFixtureInstance[] = mergeFixtures(
  mergeFixtures(mapBookshelfInstances, detectedFixtureInstances),
  manualFixtureInstances,
)
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

export function isOnFloor(x: number, z: number): boolean {
  return pointInAnyRect(floorRects, x, z)
}

export const SPAWN_POINT_WORLD: Point2 = ENTRANCE_SPAWN
