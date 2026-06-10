import type { Point2 } from '../data/floorPlan'
import type { NavigationRouteVisual } from '../hooks/useNavigationRoute'
import { robotMapToWorldXz } from './robotMapCoords'

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

export function buildVersoRouteVisual(
  status: { x: number; y: number } | null,
  path: { poses: Array<{ x: number; y: number }> } | null,
): NavigationRouteVisual | null {
  if (!path || path.poses.length === 0) return null

  const { traveled, remaining } = status
    ? splitRobotPathByPosition(path.poses, status.x, status.y)
    : { traveled: [] as Array<{ x: number; y: number }>, remaining: path.poses }

  const dimPath = mapPosesToWorld(traveled)
  const highlightPath = mapPosesToWorld(remaining)
  const currentGoal = highlightPath.length > 0 ? highlightPath[highlightPath.length - 1] : null

  return {
    dimPath,
    highlightPath,
    highlightDistanceToGoalM: null,
    currentGoal,
    activeLeg: 0,
    goals: currentGoal ? [currentGoal] : [],
  }
}
