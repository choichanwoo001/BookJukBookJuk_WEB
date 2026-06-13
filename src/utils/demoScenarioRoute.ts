import {
  floorRects,
  pillarRects,
  PLAYER_RADIUS_M,
  ENTRANCE_SPAWN,
  wallRects as baseWallRects,
} from '../data/floorPlan'
import type { Point2 } from '../data/floorPlan'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { DEMO_BOOKS, DEMO_SCENARIO_ROUTE_KEYS, type DemoBookKey } from '../data/demoScenario'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import { buildMissionShelfPool, buildNavBookshelfRects } from './missionShelfPool'
import { getMinimapWorldBounds } from './minimapBounds'
import { pickReachableBookshelfGoalWorld } from './navBookshelfGoals'
import { pickCheckoutGoalFromWorld } from './counterNavigation'
import {
  findPathWorldGrid,
  isSegmentWalkableWorld,
  type WorldBounds,
} from './gridPathfinding'
import type { WalkabilityContext } from './walkability'

export type DemoScenarioStopKind = 'spawn' | 'book' | 'checkout'

export type DemoScenarioStop = {
  id: string
  order: number
  label: string
  kind: DemoScenarioStopKind
  bookKey?: DemoBookKey
  poolIndex?: number
  goal: Point2
  shelfCx?: number
  shelfCz?: number
}

export type DemoScenarioSegment = {
  fromOrder: number
  toOrder: number
  fromLabel: string
  toLabel: string
  path: Point2[]
  distanceM: number
  connected: boolean
  color: string
}

export type DemoScenarioRoute = {
  stops: DemoScenarioStop[]
  segments: DemoScenarioSegment[]
  coveragePercent: number
  poolIndices: number[]
}

const SEGMENT_COLORS = [
  '#5ec8ff',
  '#7ee8a0',
  '#ffd166',
  '#ff9f6b',
  '#c77dff',
]

function pathLengthM(path: Point2[]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    sum += Math.hypot(bx - ax, bz - az)
  }
  return sum
}

function buildDefaultNavContext(): {
  ctx: WalkabilityContext
  bounds: WorldBounds
  pool: ReturnType<typeof buildMissionShelfPool>
} {
  const mainInstances: never[] = []
  const bounds = getMinimapWorldBounds()
  const navBounds: WorldBounds = {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  }
  const pool = buildMissionShelfPool(mainInstances, bookshelfOverlayLayerInstances)
  const navBookshelfRects = buildNavBookshelfRects(mainInstances, bookshelfOverlayLayerInstances)
  const ctx: WalkabilityContext = {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: navBookshelfRects,
    pillarRects,
    playerRadiusM: PLAYER_RADIUS_M,
  }
  return { ctx, bounds: navBounds, pool }
}

function goalForPoolIndex(
  poolIndex: number,
  from: Point2 | null,
  pool: ReturnType<typeof buildMissionShelfPool>,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
): Point2 | null {
  const inst = pool[poolIndex]
  if (!inst || inst.kind !== 'bookshelf') return null
  return pickReachableBookshelfGoalWorld(inst, from, ctx, bounds, NAV_GRID_CELL_M, NAV_GOAL_MARGIN_M)
}

function computeSegmentPath(
  from: Point2,
  to: Point2,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
): { path: Point2[]; connected: boolean } {
  const gridPath = findPathWorldGrid(from, to, ctx, bounds, NAV_GRID_CELL_M)
  if (gridPath && gridPath.length >= 2) {
    return { path: gridPath, connected: true }
  }
  if (isSegmentWalkableWorld(from, to, ctx, 0.1)) {
    return { path: [from, to], connected: true }
  }
  return { path: [from, to], connected: false }
}

function computeCoveragePercent(segments: DemoScenarioSegment[], bounds: WorldBounds): number {
  const allPoints = segments.flatMap((s) => s.path)
  if (allPoints.length === 0) return 0
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of allPoints) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const pathSpanX = Math.max(0, maxX - minX)
  const pathSpanZ = Math.max(0, maxZ - minZ)
  const mapSpanX = bounds.maxX - bounds.minX
  const mapSpanZ = bounds.maxZ - bounds.minZ
  const pathArea = pathSpanX * pathSpanZ
  const mapArea = mapSpanX * mapSpanZ
  if (mapArea <= 0) return 0
  return Math.min(100, Math.round((pathArea / mapArea) * 100))
}

export function buildDemoScenarioRoute(
  poolIndexOverrides?: Partial<Record<DemoBookKey, number>>,
): DemoScenarioRoute {
  const { ctx, bounds, pool } = buildDefaultNavContext()
  const stops: DemoScenarioStop[] = []
  let order = 1

  stops.push({
    id: 'spawn',
    order,
    label: '입구',
    kind: 'spawn',
    goal: [...ENTRANCE_SPAWN],
  })
  order++
  let previousGoal: Point2 = [...ENTRANCE_SPAWN]

  for (const bookKey of DEMO_SCENARIO_ROUTE_KEYS) {
    const def = DEMO_BOOKS[bookKey]
    const poolIndex = poolIndexOverrides?.[bookKey] ?? def.poolIndex
    const inst = pool[poolIndex]
    const goal = goalForPoolIndex(poolIndex, previousGoal, pool, ctx, bounds)
    if (!goal) continue
    stops.push({
      id: bookKey,
      order,
      label: def.title,
      kind: 'book',
      bookKey,
      poolIndex,
      goal,
      shelfCx: inst?.cx,
      shelfCz: inst?.cz,
    })
    previousGoal = goal
    order++
  }

  const lastBookGoal = [...stops].reverse().find((s) => s.kind === 'book')?.goal ?? ENTRANCE_SPAWN
  const checkoutGoal = pickCheckoutGoalFromWorld(lastBookGoal, ctx, bounds)
  if (checkoutGoal) {
    stops.push({
      id: 'checkout',
      order,
      label: '계산대',
      kind: 'checkout',
      goal: checkoutGoal,
      shelfCx: -13.861,
      shelfCz: 1.305,
    })
  }

  const segments: DemoScenarioSegment[] = []
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const { path, connected } = computeSegmentPath(from.goal, to.goal, ctx, bounds)
    segments.push({
      fromOrder: from.order,
      toOrder: to.order,
      fromLabel: from.label,
      toLabel: to.label,
      path,
      distanceM: pathLengthM(path),
      connected,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    })
  }

  const poolIndices = DEMO_SCENARIO_ROUTE_KEYS.map(
    (key) => poolIndexOverrides?.[key] ?? DEMO_BOOKS[key].poolIndex,
  )

  return {
    stops,
    segments,
    coveragePercent: computeCoveragePercent(segments, bounds),
    poolIndices,
  }
}
