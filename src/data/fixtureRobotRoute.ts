import { counterOverlayLayerInstances, bookshelfOverlayLayerInstances } from './bookshelfOverlayLayer'
import {
  ENTRANCE_SPAWN,
  type Point2,
} from './floorPlan'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import type { FixtureRenderInstance } from '../types/scene'
import { concatPaths, segmentPathWorld, type WorldBounds } from '../utils/gridPathfinding'
import { getMinimapWorldBounds } from '../utils/minimapBounds'
import { buildNavBookshelfRects } from '../utils/missionShelfPool'
import { pickReachableBookshelfGoalWorld } from '../utils/navBookshelfGoals'
import { pathLengthM } from '../utils/pathSampling'
import { createNavWalkabilityContext, type WalkabilityContext } from '../utils/walkability'
import type { NavigationRouteVisual } from '../hooks/useNavigationRoute'
import { worldXzToRobotMap } from '../utils/robotMapCoords'
import type { VersoPath } from '../lib/verso/types'
import { DEMO_BOOKS, findDemoBookByPoolIndex, findDemoBookByTitle, type DemoBookKey } from './demoScenario'

export type FixtureRobotStopKind = 'book' | 'browse' | 'checkout'

export type FixtureRobotTargetSpec = {
  id: string
  label: string
  kind: FixtureRobotStopKind
  fixtureSource: 'bookshelfOverlayLayerInstances' | 'counterOverlayLayerInstances'
  fixtureIndex: number
  originalCircle: {
    x: number
    z: number
    radius: number
  }
  purchased: boolean
}

export type FixtureRobotTarget = FixtureRobotTargetSpec & {
  fixture: FixtureRenderInstance
  fixtureCenter: Point2
  approachGoal: Point2
}

export type FixtureRobotRoute = {
  start: Point2
  targets: FixtureRobotTarget[]
  worldPath: Point2[]
  segmentEndDistancesM: number[]
  versoPath: VersoPath
}

/** 우연한 발견(browse) — 초기 2권 경로에는 포함하지 않고, book1 담기 후에만 삽입한다. */
export const SERENDIPITY_BROWSE_TARGET_SPEC: FixtureRobotTargetSpec = {
  id: 'serendipity-browse',
  label: '단 한 사람',
  kind: 'browse',
  fixtureSource: 'bookshelfOverlayLayerInstances',
  fixtureIndex: 26,
  originalCircle: { x: 2.825, z: 9.418, radius: 0.35 },
  purchased: false,
}

export const SERENDIPITY_BROWSE_POOL_INDEX = SERENDIPITY_BROWSE_TARGET_SPEC.fixtureIndex

/**
 * 출발 전 2권 경로: 오직 두 사람 → 너무나 많은 여름이
 * (결제는 계산대 이동 없이 QR로 진행 — 단 한 사람 browse는 SERENDIPITY_DETOUR_SPECS에서만)
 */
export const FIXTURE_ROBOT_TARGET_SPECS: FixtureRobotTargetSpec[] = [
  {
    id: 'first-book',
    label: '오직 두 사람',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 14,
    originalCircle: { x: 1.267, z: -12.279, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'second-book',
    label: '너무나 많은 여름이',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 9,
    originalCircle: { x: -7.279, z: 14.189, radius: 0.35 },
    purchased: true,
  },
]

/** book1 담기 후 우연한 발견 detour: 단 한 사람(browse) → 오직 두 사람 */
export const SERENDIPITY_DETOUR_SPECS: FixtureRobotTargetSpec[] = [
  SERENDIPITY_BROWSE_TARGET_SPEC,
  FIXTURE_ROBOT_TARGET_SPECS[0],
]

/**
 * 확장 경로: serendipity 추천 수락 후 적용.
 * 단 한 사람 → 어른이 된다는 것 → 너무나 많은 여름이 (오직 두 사람은 이미 방문)
 */
export const EXTENDED_FIXTURE_TARGET_SPECS: FixtureRobotTargetSpec[] = [
  {
    id: 'danjansaram-buy',
    label: '단 한 사람',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 26,
    originalCircle: { x: 2.825, z: 9.418, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'eoreun-recommendation',
    label: '어른이 된다는 것',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 4,
    originalCircle: { x: -19.442, z: -4.539, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'second-book',
    label: '너무나 많은 여름이',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 9,
    originalCircle: { x: -7.279, z: 14.189, radius: 0.35 },
    purchased: true,
  },
]

/** 우연한 발견 detour 경로에서 browse 스톱(단 한 사람)의 leg 인덱스. */
export const FIXTURE_BROWSE_STOP_LEG_INDEX = SERENDIPITY_DETOUR_SPECS.findIndex(
  (s) => s.kind === 'browse',
)

export function resolveFixtureBookKeyForLeg(
  legIndex: number,
  specs: FixtureRobotTargetSpec[] = FIXTURE_ROBOT_TARGET_SPECS,
): DemoBookKey | null {
  const spec = specs[legIndex]
  if (!spec || spec.kind === 'checkout') return null
  const def = findDemoBookByTitle(spec.label)
  return def?.key ?? null
}

export function resolveFixtureBookForShelfArrival(args: {
  legIndex: number
  poolIndex: number | null
  specs?: FixtureRobotTargetSpec[]
}): DemoBookKey | null {
  if (args.poolIndex != null) {
    const byPool = findDemoBookByPoolIndex(args.poolIndex)
    if (byPool) return byPool.key
  }
  return resolveFixtureBookKeyForLeg(args.legIndex, args.specs)
}

export function resolveFixtureRouteSpecs(poolIndices: number[] | null | undefined): FixtureRobotTargetSpec[] {
  if (!poolIndices || poolIndices.length === 0) {
    return FIXTURE_ROBOT_TARGET_SPECS
  }

  const serendipityPool = DEMO_BOOKS.serendipity.poolIndex
  const book2Pool = DEMO_BOOKS.book2.poolIndex
  const alternativePool = DEMO_BOOKS.alternative.poolIndex
  const book1Pool = DEMO_BOOKS.book1.poolIndex

  if (
    poolIndices.length === 2 &&
    poolIndices.includes(serendipityPool) &&
    poolIndices.includes(book2Pool)
  ) {
    return SERENDIPITY_DETOUR_SPECS
  }

  if (
    poolIndices.length === 2 &&
    poolIndices.includes(book2Pool) &&
    poolIndices.includes(alternativePool)
  ) {
    return FIXTURE_ROBOT_TARGET_SPECS
  }

  if (poolIndices.includes(book1Pool) && poolIndices.includes(serendipityPool)) {
    return EXTENDED_FIXTURE_TARGET_SPECS
  }

  return FIXTURE_ROBOT_TARGET_SPECS
}

function routeBounds(): WorldBounds {
  const b = getMinimapWorldBounds()
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }
}

export function buildFixtureRobotWalkabilityContext(): WalkabilityContext {
  return createNavWalkabilityContext(
    buildNavBookshelfRects([], bookshelfOverlayLayerInstances),
  )
}

function fixtureForSpec(spec: FixtureRobotTargetSpec): FixtureRenderInstance {
  const fixture =
    spec.fixtureSource === 'bookshelfOverlayLayerInstances'
      ? bookshelfOverlayLayerInstances[spec.fixtureIndex]
      : counterOverlayLayerInstances[spec.fixtureIndex]
  if (!fixture) {
    throw new Error(`Missing fixture robot target ${spec.fixtureSource}[${spec.fixtureIndex}]`)
  }
  return fixture
}

export function buildFixtureRobotRoute(
  specs: FixtureRobotTargetSpec[] = FIXTURE_ROBOT_TARGET_SPECS,
  start: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]],
): FixtureRobotRoute {
  const ctx = buildFixtureRobotWalkabilityContext()
  const bounds = routeBounds()
  const targets: FixtureRobotTarget[] = []
  let previous: Point2 = [...start]

  for (const spec of specs) {
    const fixture = fixtureForSpec(spec)
    const goal =
      pickReachableBookshelfGoalWorld(
        fixture,
        previous,
        ctx,
        bounds,
        NAV_GRID_CELL_M,
        NAV_GOAL_MARGIN_M,
      ) ?? [spec.originalCircle.x, spec.originalCircle.z]

    targets.push({
      ...spec,
      fixture,
      fixtureCenter: [fixture.cx, fixture.cz],
      approachGoal: goal,
    })
    previous = goal
  }

  let worldPath: Point2[] = []
  const segmentEndDistancesM: number[] = []
  let from: Point2 = [...start]
  for (const target of targets) {
    const path = segmentPathWorld(from, target.approachGoal, ctx, bounds, NAV_GRID_CELL_M)
    if (path.length >= 2) {
      worldPath = worldPath.length === 0 ? path.slice() : concatPaths(worldPath, path)
      from = target.approachGoal
    }
    segmentEndDistancesM.push(pathLengthM(worldPath))
  }

  return {
    start: worldPath[0] ?? [...start],
    targets,
    worldPath,
    segmentEndDistancesM,
    versoPath: {
      poses: worldPath.map(([x, z]) => worldXzToRobotMap(x, z)),
    },
  }
}

export function buildSerendipityBrowseRoute(from?: Point2): FixtureRobotRoute {
  const start = from ?? [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
  return buildFixtureRobotRoute([SERENDIPITY_BROWSE_TARGET_SPEC], start)
}

export function serendipityOnlyDirectGoals(from?: Point2): Point2[] {
  return buildSerendipityBrowseRoute(from).targets.map((target) => target.approachGoal)
}

export function buildFixtureRobotRouteFromGoals(
  goals: Point2[],
  start: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]],
): FixtureRobotRoute {
  const ctx = buildFixtureRobotWalkabilityContext()
  const bounds = routeBounds()
  let worldPath: Point2[] = []
  const segmentEndDistancesM: number[] = []
  let from: Point2 = [...start]
  for (const goal of goals) {
    const path = segmentPathWorld(from, goal, ctx, bounds, NAV_GRID_CELL_M)
    if (path.length >= 2) {
      worldPath = worldPath.length === 0 ? path.slice() : concatPaths(worldPath, path)
      from = goal
    }
    segmentEndDistancesM.push(pathLengthM(worldPath))
  }
  return {
    start: worldPath[0] ?? [...start],
    targets: [],
    worldPath,
    segmentEndDistancesM,
    versoPath: {
      poses: worldPath.map(([x, z]) => worldXzToRobotMap(x, z)),
    },
  }
}

export function serendipityDetourDirectGoals(): Point2[] {
  return buildFixtureRobotRoute(SERENDIPITY_DETOUR_SPECS).targets.map(
    (target) => target.approachGoal,
  )
}

export function fixtureRobotDirectGoals(poolIndices?: number[] | null): Point2[] {
  const specs = poolIndices ? resolveFixtureRouteSpecs(poolIndices) : FIXTURE_ROBOT_TARGET_SPECS
  return buildFixtureRobotRoute(specs).targets.map((target) => target.approachGoal)
}

/**
 * serendipity 추천 수락 후 확장 경로 목표 좌표.
 * 단 한 사람 → 어른이 된다는 것 → 너무나 많은 여름이.
 */
export function extendedFixtureRobotDirectGoals(): Point2[] {
  return buildFixtureRobotRoute(EXTENDED_FIXTURE_TARGET_SPECS).targets.map(
    (target) => target.approachGoal,
  )
}

export function buildFixtureRoutePlanVisual(): NavigationRouteVisual {
  const route = buildFixtureRobotRoute()
  const goals = route.targets.map((target) => target.approachGoal)
  return {
    planPath: route.worldPath,
    dimPath: route.worldPath,
    highlightPath: [],
    highlightDistanceToGoalM: null,
    currentGoal: goals[0] ?? null,
    activeLeg: 0,
    goals,
  }
}
