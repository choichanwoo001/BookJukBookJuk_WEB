import { counterOverlayLayerInstances, bookshelfOverlayLayerInstances } from './bookshelfOverlayLayer'
import {
  ENTRANCE_SPAWN,
  type Point2,
} from './floorPlan'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M, NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'
import type { FixtureRenderInstance } from '../types/scene'
import { findPathWorldGrid, isSegmentWalkableWorld, type WorldBounds } from '../utils/gridPathfinding'
import { getMinimapWorldBounds } from '../utils/minimapBounds'
import { buildNavBookshelfRects } from '../utils/missionShelfPool'
import { pickReachableBookshelfGoalWorld } from '../utils/navBookshelfGoals'
import { pathLengthM } from '../utils/pathSampling'
import { createNavWalkabilityContext, type WalkabilityContext } from '../utils/walkability'
import type { NavigationRouteVisual } from '../hooks/useNavigationRoute'
import { worldXzToRobotMap } from '../utils/robotMapCoords'
import type { VersoPath } from '../lib/verso/types'

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

export const FIXTURE_ROBOT_TARGET_SPECS: FixtureRobotTargetSpec[] = [
  {
    id: 'first-book',
    label: '첫번째 책',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 14,
    originalCircle: { x: 1.267, z: -12.279, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'second-book',
    label: '두번째 책',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 9,
    originalCircle: { x: -7.279, z: 14.189, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'serendipity-browse',
    label: '우연한 발견',
    kind: 'browse',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 26,
    originalCircle: { x: 4.62, z: 9.558, radius: 0.35 },
    purchased: false,
  },
  {
    id: 'final-recommendation',
    label: '마지막 추천 책',
    kind: 'book',
    fixtureSource: 'bookshelfOverlayLayerInstances',
    fixtureIndex: 4,
    originalCircle: { x: -19.874, z: -4.515, radius: 0.35 },
    purchased: true,
  },
  {
    id: 'checkout',
    label: '계산대',
    kind: 'checkout',
    fixtureSource: 'counterOverlayLayerInstances',
    fixtureIndex: 1,
    originalCircle: { x: -6.227, z: 4.953, radius: 0.35 },
    purchased: false,
  },
]

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

function concatPaths(a: Point2[], b: Point2[]): Point2[] {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const last = a[a.length - 1]
  const first = b[0]
  if (last[0] === first[0] && last[1] === first[1]) {
    return [...a, ...b.slice(1)]
  }
  return [...a, ...b]
}

function segmentPath(from: Point2, to: Point2, ctx: WalkabilityContext, bounds: WorldBounds): Point2[] {
  const routed = findPathWorldGrid(from, to, ctx, bounds, NAV_GRID_CELL_M)
  if (routed && routed.length >= 2) return routed
  if (isSegmentWalkableWorld(from, to, ctx, NAV_SEGMENT_SAMPLE_STEP_M)) {
    return [from, to]
  }
  return []
}

export function buildFixtureRobotRoute(): FixtureRobotRoute {
  const ctx = buildFixtureRobotWalkabilityContext()
  const bounds = routeBounds()
  const targets: FixtureRobotTarget[] = []
  let previous: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]

  for (const spec of FIXTURE_ROBOT_TARGET_SPECS) {
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
  let from: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
  for (const target of targets) {
    const path = segmentPath(from, target.approachGoal, ctx, bounds)
    if (path.length >= 2) {
      worldPath = worldPath.length === 0 ? path.slice() : concatPaths(worldPath, path)
      from = target.approachGoal
    }
    segmentEndDistancesM.push(pathLengthM(worldPath))
  }

  return {
    start: worldPath[0] ?? [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]],
    targets,
    worldPath,
    segmentEndDistancesM,
    versoPath: {
      poses: worldPath.map(([x, z]) => worldXzToRobotMap(x, z)),
    },
  }
}

export function fixtureRobotDirectGoals(): Point2[] {
  return buildFixtureRobotRoute().targets.map((target) => target.approachGoal)
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
