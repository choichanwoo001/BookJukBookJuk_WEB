import {
  wallRects as rawWallRects,
  pillarRects as rawPillarRects,
  bookshelfInstances as rawBookshelfInstances,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  bookshelfPolygons as rawBookshelfPolygons,
  mapWidth,
  mapDepth,
  MAP_RESOLUTION,
  MAP_IMAGE_ORIGIN_X,
  MAP_IMAGE_ORIGIN_Z,
  mapImageOffsetX,
  mapImageOffsetZ,
} from './mapData'
import type { WallRect, BookshelfInstance as MapBookshelfInstance } from './mapData'
import { detectedFixtures } from './detectedFixtures'
import { isExcludedMapBookshelfPosition } from './excludedMapBookshelfIds'
import { nearestShelfId } from './shelfIdRegistry'
import { getSectorByShelfId } from './shelfSectorAssignments'
import { axisAlignedBoundsForRotatedBookshelf } from '../utils/bookshelfCollision'
import { pointInAnyRect } from '../utils/rectUtils'

const keptMapBookshelfIndices = rawBookshelfInstances
  .map((m, i) => {
    if (isExcludedMapBookshelfPosition(m.cx, m.cz, nearestShelfId(m.cx, m.cz))) return -1
    return i
  })
  .filter((i): i is number => i >= 0)

const filteredRawBookshelfInstances = keptMapBookshelfIndices.map((i) => rawBookshelfInstances[i])
const filteredRawBookshelfPolygons = keptMapBookshelfIndices.map((i) => rawBookshelfPolygons[i])

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
  shelfId?: string
  sector?: number | null
}

/** Map bookshelf + stable shelf id + sector (from shelfSectorAssignments). */
export type BookshelfInstance = MapBookshelfInstance & { shelfId: string; sector?: number }

export type RuntimeFixtureInstance = ManualFixtureInstance

/**
 * 스폰 시드: `map_info/b2floor_edited.yaml`의 `origin`이 맵 격자 (0,0)에 대응.
 * `mapData`는 `node scripts/processMap.mjs`가 YAML에서 읽은 origin·centroid offset을 반영해 생성.
 * 런타임 xz = `pxToWorld(0,0)` − `mapImageOffset` = `MAP_IMAGE_ORIGIN_*` − `mapImageOffset*`.
 * `useWorldMovement`의 `findSpawnPosition`이 이 점이 막혀 있으면 주변을 탐색.
 */
export const SPAWN_POINT_WORLD: Point2 = [
  MAP_IMAGE_ORIGIN_X - mapImageOffsetX,
  MAP_IMAGE_ORIGIN_Z - mapImageOffsetZ,
]

/**
 * Runtime-only floor quads merged into `floorRects` for walk mesh / spawn overlap.
 * They are not produced from the occupancy PGM; exclude when validating “map file only” geometry.
 * Regenerate base rects with `node scripts/processMap.mjs` (optional `--dump-classified-pgm`).
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
export const bookshelfPolygons = filteredRawBookshelfPolygons.filter(loop => loop.length >= 3)

/** Map-derived footprint per shelf id (parallel to filtered raw instances). L-shape shelves use this for mesh; nav still uses `bookshelfPolygons`. */
export const bookshelfPolygonByShelfId: Record<string, Point2[]> = (() => {
  const out: Record<string, Point2[]> = {}
  for (let i = 0; i < filteredRawBookshelfInstances.length; i++) {
    const row = filteredRawBookshelfInstances[i]
    const shelfId = nearestShelfId(row.cx, row.cz)
    if (!shelfId) continue
    const poly = filteredRawBookshelfPolygons[i]
    if (poly && poly.length >= 3) {
      out[shelfId] = poly.map((p) => [p[0], p[1]] as Point2)
    }
  }
  return out
})()

/** Render as extruded map polygon (ㄱ/ㄴ형); main mass uses OBB — see SceneContent. */
export const BOOKSHELF_POLYGON_RENDER_IDS = ['shelf_037', 'shelf_041'] as const

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

const mapBookshelfInstances: RuntimeFixtureInstance[] = filteredRawBookshelfInstances.map((fixture) => ({
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

const GEOM_EPS = 1e-4

function fixtureGeomEqual(
  a: Pick<ManualFixtureInstance, 'cx' | 'cz' | 'w' | 'd' | 'yaw'>,
  b: Pick<ManualFixtureInstance, 'cx' | 'cz' | 'w' | 'd' | 'yaw'>,
): boolean {
  return (
    Math.abs(a.cx - b.cx) < GEOM_EPS
    && Math.abs(a.cz - b.cz) < GEOM_EPS
    && Math.abs(a.yaw - b.yaw) < GEOM_EPS
    && Math.abs(a.w - b.w) < GEOM_EPS
    && Math.abs(a.d - b.d) < GEOM_EPS
  )
}

const sortedBookshelfModelsForIds = [...bookshelfInstanceModels].sort((a, b) => a.cz - b.cz || a.cx - b.cx)

function shelfIdForBookshelfModel(
  model: Pick<ManualFixtureInstance, 'cx' | 'cz' | 'w' | 'd' | 'yaw'>,
): string {
  const guess = nearestShelfId(model.cx, model.cz)
  if (guess) return guess
  const idx = sortedBookshelfModelsForIds.findIndex((s) => fixtureGeomEqual(s, model))
  if (idx >= 0) return `shelf_${String(idx + 1).padStart(3, '0')}`
  console.warn('[floorPlan] Bookshelf could not be matched to a registry shelf id:', model)
  return `shelf_unknown_${model.cx.toFixed(2)}_${model.cz.toFixed(2)}`
}

export const bookshelfInstances: BookshelfInstance[] = bookshelfInstanceModels.map((s) => {
  const shelfId = shelfIdForBookshelfModel(s)
  const sector = getSectorByShelfId(shelfId)
  return {
    cx: s.cx,
    cz: s.cz,
    w: s.w,
    d: s.d,
    yaw: s.yaw,
    shelfId,
    ...(sector !== undefined ? { sector } : {}),
  }
})
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
export type { WallRect }

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

