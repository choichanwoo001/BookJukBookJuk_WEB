import type { VersoWaypoint } from '../lib/verso/types'
import { counterOverlayLayerInstances, bookshelfOverlayLayerInstances } from './bookshelfOverlayLayer'
import {
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
import {
  initialRobotMissionWaypoints,
  robotMapBook2WorldXz,
  robotMapStartWorldXz,
} from '../lib/verso/robotMissionCoords'
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

/** 시연 3권 — 오직 두 사람, 어른이 된다는 것, 단 한 사람 */
export const SCENARIO_BOOK_KEYS = ['book2', 'book1', 'serendipity'] as const

export type ScenarioBookKey = (typeof SCENARIO_BOOK_KEYS)[number]

function scenarioTargetSpec(
  key: DemoBookKey,
  overrides?: Partial<FixtureRobotTargetSpec>,
): FixtureRobotTargetSpec {
  switch (key) {
    case 'book2': {
      const [bx, bz] = robotMapBook2WorldXz()
      return {
        id: 'book2',
        label: DEMO_BOOKS.book2.title,
        kind: 'book',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: DEMO_BOOKS.book2.poolIndex,
        originalCircle: { x: bx, z: bz, radius: 0.35 },
        purchased: true,
        ...overrides,
      }
    }
    case 'book1':
      return {
        id: 'book1',
        label: DEMO_BOOKS.book1.title,
        kind: 'book',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: DEMO_BOOKS.book1.poolIndex,
        originalCircle: { x: -19.442, z: -4.539, radius: 0.35 },
        purchased: true,
        ...overrides,
      }
    case 'serendipity':
      return {
        id: 'serendipity',
        label: DEMO_BOOKS.serendipity.title,
        kind: 'book',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: DEMO_BOOKS.serendipity.poolIndex,
        originalCircle: { x: 2.825, z: 9.418, radius: 0.35 },
        purchased: true,
        ...overrides,
      }
    default:
      throw new Error(`Unsupported scenario book key: ${key}`)
  }
}

/** 출발 전 1권: 오직 두 사람 */
export const INITIAL_SCENARIO_SPECS: FixtureRobotTargetSpec[] = [scenarioTargetSpec('book2')]

/** 우연한 발견 detour browse — 단 한 사람 (담지 않음) */
export const SERENDIPITY_BROWSE_TARGET_SPEC: FixtureRobotTargetSpec = scenarioTargetSpec('serendipity', {
  id: 'serendipity-browse',
  kind: 'browse',
  purchased: false,
})

export const SERENDIPITY_BROWSE_POOL_INDEX = SERENDIPITY_BROWSE_TARGET_SPEC.fixtureIndex

/** @deprecated alias — use INITIAL_SCENARIO_SPECS */
export const FIXTURE_ROBOT_TARGET_SPECS: FixtureRobotTargetSpec[] = INITIAL_SCENARIO_SPECS

/** detour 후 확장: 오직 두 사람 → 어른이 된다는 것 */
export const EXTENDED_SCENARIO_SPECS: FixtureRobotTargetSpec[] = [
  scenarioTargetSpec('book2'),
  scenarioTargetSpec('book1'),
]

/** @deprecated alias — use EXTENDED_SCENARIO_SPECS */
export const EXTENDED_FIXTURE_TARGET_SPECS: FixtureRobotTargetSpec[] = EXTENDED_SCENARIO_SPECS

/** @deprecated legacy name — browse-only detour uses SERENDIPITY_BROWSE_TARGET_SPEC */
export const SERENDIPITY_DETOUR_SPECS: FixtureRobotTargetSpec[] = [
  SERENDIPITY_BROWSE_TARGET_SPEC,
  INITIAL_SCENARIO_SPECS[0],
]

export function scenarioBookTargetSpec(key: DemoBookKey): FixtureRobotTargetSpec {
  return scenarioTargetSpec(key)
}

export function scenarioBookApproachGoal(key: DemoBookKey): Point2 {
  const spec =
    key === 'serendipity' ? SERENDIPITY_BROWSE_TARGET_SPEC : scenarioTargetSpec(key)
  const route = buildFixtureRobotRoute([spec])
  return route.targets[0]!.approachGoal
}

export function scenarioBookWaypoints(keys: DemoBookKey[]): VersoWaypoint[] {
  if (keys.length === 1 && keys[0] === 'book2') {
    return initialRobotMissionWaypoints()
  }
  const specs = keys.map((key) => {
    if (key === 'serendipity' && keys.length === 1) {
      return SERENDIPITY_BROWSE_TARGET_SPEC
    }
    return scenarioTargetSpec(key)
  })
  const route = buildFixtureRobotRoute(specs)
  return route.targets.map((target) => {
    if (target.id === 'book2') {
      return initialRobotMissionWaypoints()[0]!
    }
    const map = worldXzToRobotMap(target.approachGoal[0], target.approachGoal[1])
    return {
      id: target.id,
      x: map.x,
      y: map.y,
      label: target.label,
    }
  })
}

const GOAL_MATCH_EPS_M = 0.05

function goalsApproximatelyEqual(a: Point2[], b: Point2[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => {
    const q = b[i]!
    return Math.hypot(p[0] - q[0], p[1] - q[1]) <= GOAL_MATCH_EPS_M
  })
}

/** Match fixture scenario goals to labeled robot waypoints. */
export function resolveScenarioWaypointsForGoals(goals: Point2[]): VersoWaypoint[] | null {
  const candidates: DemoBookKey[][] = [
    ['book2'],
    ['serendipity'],
    ['book2', 'book1'],
  ]
  for (const keys of candidates) {
    let expected: Point2[]
    if (keys.length === 1 && keys[0] === 'book2') {
      expected = fixtureRobotDirectGoals()
    } else if (keys.length === 1 && keys[0] === 'serendipity') {
      expected = serendipityOnlyDirectGoals()
    } else {
      expected = extendedFixtureRobotDirectGoals()
    }
    if (goalsApproximatelyEqual(expected, goals)) {
      return scenarioBookWaypoints(keys)
    }
  }
  return null
}

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
    return INITIAL_SCENARIO_SPECS
  }

  const serendipityPool = DEMO_BOOKS.serendipity.poolIndex
  const book2Pool = DEMO_BOOKS.book2.poolIndex
  const book1Pool = DEMO_BOOKS.book1.poolIndex

  if (
    poolIndices.length === 2 &&
    poolIndices.includes(book2Pool) &&
    poolIndices.includes(book1Pool)
  ) {
    return EXTENDED_SCENARIO_SPECS
  }

  if (poolIndices.includes(serendipityPool) && poolIndices.includes(book2Pool)) {
    return SERENDIPITY_DETOUR_SPECS
  }

  if (poolIndices.includes(book2Pool)) {
    return INITIAL_SCENARIO_SPECS
  }

  return INITIAL_SCENARIO_SPECS
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

function fixtureApproachGoal(
  spec: FixtureRobotTargetSpec,
  previous: Point2,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
): Point2 {
  if (spec.id === 'book2') {
    return robotMapBook2WorldXz()
  }
  const fixture = fixtureForSpec(spec)
  return (
    pickReachableBookshelfGoalWorld(
      fixture,
      previous,
      ctx,
      bounds,
      NAV_GRID_CELL_M,
      NAV_GOAL_MARGIN_M,
    ) ?? [spec.originalCircle.x, spec.originalCircle.z]
  )
}

export function buildFixtureRobotRoute(
  specs: FixtureRobotTargetSpec[] = FIXTURE_ROBOT_TARGET_SPECS,
  start: Point2 = robotMapStartWorldXz(),
): FixtureRobotRoute {
  const ctx = buildFixtureRobotWalkabilityContext()
  const bounds = routeBounds()
  const targets: FixtureRobotTarget[] = []
  let previous: Point2 = [...start]

  for (const spec of specs) {
    const fixture = fixtureForSpec(spec)
    const goal = fixtureApproachGoal(spec, previous, ctx, bounds)

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
  const start = from ?? robotMapStartWorldXz()
  return buildFixtureRobotRoute([SERENDIPITY_BROWSE_TARGET_SPEC], start)
}

export function serendipityOnlyDirectGoals(from?: Point2): Point2[] {
  return buildSerendipityBrowseRoute(from).targets.map((target) => target.approachGoal)
}

export function buildFixtureRobotRouteFromGoals(
  goals: Point2[],
  start: Point2 = robotMapStartWorldXz(),
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
  const specs = poolIndices ? resolveFixtureRouteSpecs(poolIndices) : INITIAL_SCENARIO_SPECS
  return buildFixtureRobotRoute(specs).targets.map((target) => target.approachGoal)
}

/**
 * serendipity 추천 수락 후 확장 경로: 오직 두 사람 → 어른이 된다는 것.
 */
export function extendedFixtureRobotDirectGoals(): Point2[] {
  return buildFixtureRobotRoute(EXTENDED_SCENARIO_SPECS).targets.map(
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
