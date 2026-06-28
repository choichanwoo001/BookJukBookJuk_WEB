import {
  wallRects as rawWallRects,
  pillarRects as rawPillarRects,
  wallPolylines as rawWallPolylines,
  wallHolePolylines as rawWallHolePolylines,
  floorRects as rawFloorRects,
  mapWidth, mapDepth, MAP_RESOLUTION,
} from './mapData'
import type { WallRect, BookshelfInstance } from './mapData'
import type { FixtureRenderInstance } from '../types/scene'
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
const FLOOR_EDGE_SEAL_M = MAP_RESOLUTION * 3

function rectBounds(r: WallRect) {
  return {
    minX: r.cx - r.w * 0.5,
    maxX: r.cx + r.w * 0.5,
    minZ: r.cz - r.d * 0.5,
    maxZ: r.cz + r.d * 0.5,
  }
}

function rectFromBounds(minX: number, maxX: number, minZ: number, maxZ: number): WallRect | null {
  const w = maxX - minX
  const d = maxZ - minZ
  const minSize = MAP_RESOLUTION * 0.2
  if (w <= minSize || d <= minSize) return null
  return {
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    w,
    d,
  }
}

function rectsOverlap(a: WallRect, b: WallRect, padding = 0): boolean {
  const ab = rectBounds(a)
  const bb = rectBounds(b)
  return (
    ab.minX < bb.maxX + padding &&
    ab.maxX > bb.minX - padding &&
    ab.minZ < bb.maxZ + padding &&
    ab.maxZ > bb.minZ - padding
  )
}

function subtractRect(subject: WallRect, cutter: WallRect): WallRect[] {
  if (!rectsOverlap(subject, cutter)) return [subject]

  const s = rectBounds(subject)
  const c = rectBounds(cutter)
  const ix0 = Math.max(s.minX, c.minX)
  const ix1 = Math.min(s.maxX, c.maxX)
  const iz0 = Math.max(s.minZ, c.minZ)
  const iz1 = Math.min(s.maxZ, c.maxZ)
  const pieces: WallRect[] = []

  const left = rectFromBounds(s.minX, ix0, s.minZ, s.maxZ)
  const right = rectFromBounds(ix1, s.maxX, s.minZ, s.maxZ)
  const bottom = rectFromBounds(ix0, ix1, s.minZ, iz0)
  const top = rectFromBounds(ix0, ix1, iz1, s.maxZ)

  if (left) pieces.push(left)
  if (right) pieces.push(right)
  if (bottom) pieces.push(bottom)
  if (top) pieces.push(top)
  return pieces
}

function createRectOverlapIndex(rects: WallRect[], cellSize = 1) {
  const safeCellSize = Math.max(MAP_RESOLUTION, cellSize)
  const buckets = new Map<string, WallRect[]>()
  const key = (ix: number, iz: number) => `${ix},${iz}`

  for (const r of rects) {
    const b = rectBounds(r)
    const ix0 = Math.floor(b.minX / safeCellSize)
    const ix1 = Math.floor(b.maxX / safeCellSize)
    const iz0 = Math.floor(b.minZ / safeCellSize)
    const iz1 = Math.floor(b.maxZ / safeCellSize)

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const bucketKey = key(ix, iz)
        const bucket = buckets.get(bucketKey)
        if (bucket) bucket.push(r)
        else buckets.set(bucketKey, [r])
      }
    }
  }

  return (r: WallRect, padding = 0): WallRect[] => {
    const b = rectBounds(r)
    const ix0 = Math.floor((b.minX - padding) / safeCellSize)
    const ix1 = Math.floor((b.maxX + padding) / safeCellSize)
    const iz0 = Math.floor((b.minZ - padding) / safeCellSize)
    const iz1 = Math.floor((b.maxZ + padding) / safeCellSize)
    const out: WallRect[] = []
    const seen = new Set<WallRect>()

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const bucket = buckets.get(key(ix, iz))
        if (!bucket) continue
        for (const candidate of bucket) {
          if (seen.has(candidate)) continue
          seen.add(candidate)
          if (rectsOverlap(r, candidate, padding)) out.push(candidate)
        }
      }
    }

    return out
  }
}

function clipFloorRectsAgainstWalls(floors: WallRect[], walls: WallRect[]): WallRect[] {
  const findWalls = createRectOverlapIndex(walls, 0.75)
  const out: WallRect[] = []

  for (const floor of floors) {
    let pieces = [floor]
    for (const wall of findWalls(floor)) {
      const next: WallRect[] = []
      for (const piece of pieces) next.push(...subtractRect(piece, wall))
      pieces = next
      if (pieces.length === 0) break
    }
    out.push(...pieces)
  }

  return out
}

function intersectRect(a: WallRect, b: WallRect): WallRect | null {
  const ab = rectBounds(a)
  const bb = rectBounds(b)
  return rectFromBounds(
    Math.max(ab.minX, bb.minX),
    Math.min(ab.maxX, bb.maxX),
    Math.max(ab.minZ, bb.minZ),
    Math.min(ab.maxZ, bb.maxZ),
  )
}

function intersectRectsWithEnvelope(rects: WallRect[], envelope: WallRect[]): WallRect[] {
  const findEnvelope = createRectOverlapIndex(envelope, 0.75)
  const out: WallRect[] = []

  for (const r of rects) {
    for (const env of findEnvelope(r)) {
      const clipped = intersectRect(r, env)
      if (clipped) out.push(clipped)
    }
  }

  return out
}

function expandFloorRects(floors: WallRect[], amount: number): WallRect[] {
  if (amount <= 0) return floors
  return floors.map((r) => ({
    cx: r.cx,
    cz: r.cz,
    w: r.w + amount * 2,
    d: r.d + amount * 2,
  }))
}

function clipRectsToKnownFloorEnvelope(rects: WallRect[], knownFloors: WallRect[]): WallRect[] {
  return intersectRectsWithEnvelope(rects, expandFloorRects(knownFloors, FLOOR_EDGE_SEAL_M))
}

function buildWallEdgeFloorFillRects(
  floors: WallRect[],
  walls: WallRect[],
  knownFloors: WallRect[],
): WallRect[] {
  const fillDepth = FLOOR_EDGE_SEAL_M
  const floorProbePadding = FLOOR_EDGE_SEAL_M
  const floorContainsPoint = createRectPointIndex(floors, 0.75)
  const wallContainsPoint = createRectPointIndex(walls, 0.75)
  const fills: WallRect[] = []

  for (const wall of walls) {
    const b = rectBounds(wall)
    const sides = [
      {
        fill: rectFromBounds(b.minX - fillDepth, b.minX, b.minZ, b.maxZ),
        probeX: b.minX - fillDepth,
        probeZ: wall.cz,
      },
      {
        fill: rectFromBounds(b.maxX, b.maxX + fillDepth, b.minZ, b.maxZ),
        probeX: b.maxX + fillDepth,
        probeZ: wall.cz,
      },
      {
        fill: rectFromBounds(b.minX, b.maxX, b.minZ - fillDepth, b.minZ),
        probeX: wall.cx,
        probeZ: b.minZ - fillDepth,
      },
      {
        fill: rectFromBounds(b.minX, b.maxX, b.maxZ, b.maxZ + fillDepth),
        probeX: wall.cx,
        probeZ: b.maxZ + fillDepth,
      },
    ]

    for (const side of sides) {
      if (!side.fill) continue
      if (wallContainsPoint(side.fill.cx, side.fill.cz, MAP_RESOLUTION * 0.1)) continue
      if (!floorContainsPoint(side.probeX, side.probeZ, floorProbePadding)) continue
      fills.push(side.fill)
    }
  }

  return clipFloorRectsAgainstWalls(clipRectsToKnownFloorEnvelope(fills, knownFloors), walls)
}

function buildCleanFloorRects(floors: WallRect[], walls: WallRect[]): WallRect[] {
  const sealedFloors = expandFloorRects(floors, FLOOR_EDGE_SEAL_M)
  const clippedFloors = clipFloorRectsAgainstWalls(sealedFloors, walls)
  return [
    ...clippedFloors,
    ...buildWallEdgeFloorFillRects(clippedFloors, walls, floors),
    ...SPAWN_FLOOR_PATCH_RECTS,
  ]
}

export function buildFixtureFloorSupportRects(
  instances: Pick<FixtureRenderInstance, 'cx' | 'cz' | 'w' | 'd' | 'yaw' | 'footprint'>[],
): WallRect[] {
  const supportPadding = FLOOR_EDGE_SEAL_M * 1.5
  const patches = instances.map((inst) => {
    if (inst.footprint && inst.footprint.length >= 3) {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const [x, z] of inst.footprint) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
      return {
        cx: (minX + maxX) * 0.5,
        cz: (minZ + maxZ) * 0.5,
        w: maxX - minX + supportPadding * 2,
        d: maxZ - minZ + supportPadding * 2,
      }
    }

    const base = axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw)
    return {
      cx: base.cx,
      cz: base.cz,
      w: base.w + supportPadding * 2,
      d: base.d + supportPadding * 2,
    }
  })

  const floorClipped = clipRectsToKnownFloorEnvelope(patches, rawFloorRects)
  return clipFloorRectsAgainstWalls(floorClipped, wallRects)
}

export const floorRenderRects = buildCleanFloorRects(rawFloorRects, wallRects)
export const floorRects = floorRenderRects
const MANUAL_PILLAR_SELECTION_RADIUS_M = 0.35
const MANUAL_PILLAR_RADIUS_M = MANUAL_PILLAR_SELECTION_RADIUS_M / 2
const MANUAL_PILLAR_REPLACE_RADIUS_M = MANUAL_PILLAR_SELECTION_RADIUS_M + MAP_RESOLUTION * 2

const manualPillarRects: WallRect[] = [
  { cx: 0.582, cz: 3.958, w: MANUAL_PILLAR_RADIUS_M * 2, d: MANUAL_PILLAR_RADIUS_M * 2 },
  { cx: -1.732, cz: -1.769, w: MANUAL_PILLAR_RADIUS_M * 2, d: MANUAL_PILLAR_RADIUS_M * 2 },
  { cx: -3.742, cz: -7.534, w: MANUAL_PILLAR_RADIUS_M * 2, d: MANUAL_PILLAR_RADIUS_M * 2 },
]

const rawPillarRectsOutsideManualAreas = rawPillarRects.filter((pillar) =>
  !manualPillarRects.some((manual) =>
    Math.hypot(pillar.cx - manual.cx, pillar.cz - manual.cz) <= MANUAL_PILLAR_REPLACE_RADIUS_M,
  ),
)

export const pillarRects = [...rawPillarRectsOutsideManualAreas, ...manualPillarRects]
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
