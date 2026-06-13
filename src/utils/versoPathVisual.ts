import type { Point2 } from '../data/floorPlan'
import { NAV_GRID_CELL_M, NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'
import type { NavigationRouteVisual } from '../hooks/useNavigationRoute'
import {
  concatPaths,
  findPathWorldGrid,
  isSegmentWalkableWorld,
  type WorldBounds,
} from './gridPathfinding'
import { robotMapToWorldXz } from './robotMapCoords'
import type { WalkabilityContext } from './walkability'

export function splitRobotPathByPosition(
  poses: Array<{ x: number; y: number }>,
  currentX: number,
  currentY: number,
): { traveled: Array<{ x: number; y: number }>; remaining: Array<{ x: number; y: number }> } {
  if (poses.length === 0) {
    return { traveled: [], remaining: [] }
  }

  let minDist = Infinity
  let splitIdx = 0
  poses.forEach((p, i) => {
    const d = Math.hypot(p.x - currentX, p.y - currentY)
    if (d < minDist) {
      minDist = d
      splitIdx = i
    }
  })

  return {
    traveled: poses.slice(0, splitIdx),
    remaining: poses.slice(splitIdx),
  }
}

function mapPosesToWorld(poses: Array<{ x: number; y: number }>): Point2[] {
  return poses.map((p) => {
    const [x, z] = robotMapToWorldXz(p.x, p.y)
    return [x, z] as Point2
  })
}

function densifyWorldPath(
  worldPath: Point2[],
  ctx: WalkabilityContext,
  bounds: WorldBounds,
): Point2[] {
  if (worldPath.length < 2) return worldPath.slice()

  let out: Point2[] = []
  for (let i = 0; i < worldPath.length - 1; i++) {
    const from = worldPath[i]
    const to = worldPath[i + 1]
    const routed = findPathWorldGrid(from, to, ctx, bounds, NAV_GRID_CELL_M)
    if (routed && routed.length >= 2) {
      out = out.length === 0 ? routed.slice() : concatPaths(out, routed)
      continue
    }
    if (isSegmentWalkableWorld(from, to, ctx, NAV_SEGMENT_SAMPLE_STEP_M)) {
      const segment: Point2[] = [from, to]
      out = out.length === 0 ? segment : concatPaths(out, segment)
    }
  }
  return out.length > 0 ? out : worldPath.slice()
}

export type VersoRouteVisualOptions = {
  walkabilityCtx?: WalkabilityContext
  bounds?: WorldBounds
}

export function buildVersoRouteVisual(
  status: { x: number; y: number } | null,
  path: { poses: Array<{ x: number; y: number }> } | null,
  options?: VersoRouteVisualOptions,
): NavigationRouteVisual | null {
  if (!path || path.poses.length === 0) return null

  const { traveled, remaining } = status
    ? splitRobotPathByPosition(path.poses, status.x, status.y)
    : { traveled: [] as Array<{ x: number; y: number }>, remaining: path.poses }

  let dimPath = mapPosesToWorld(traveled)
  let highlightPath = mapPosesToWorld(remaining)

  const { walkabilityCtx, bounds } = options ?? {}
  if (walkabilityCtx && bounds) {
    dimPath = densifyWorldPath(dimPath, walkabilityCtx, bounds)
    highlightPath = densifyWorldPath(highlightPath, walkabilityCtx, bounds)
  }

  const currentGoal = highlightPath.length > 0 ? highlightPath[highlightPath.length - 1] : null

  return {
    planPath: concatPaths(dimPath, highlightPath),
    dimPath,
    highlightPath,
    highlightDistanceToGoalM: null,
    currentGoal,
    activeLeg: 0,
    goals: currentGoal ? [currentGoal] : [],
  }
}
