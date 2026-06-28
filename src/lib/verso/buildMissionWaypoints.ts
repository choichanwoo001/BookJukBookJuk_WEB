import type { DemoBookKey } from '../../data/demoScenario'
import { scenarioBookWaypoints } from '../../data/fixtureRobotRoute'
import type { Point2 } from '../../data/floorPlan'
import { worldXzToRobotMap } from '../../utils/robotMapCoords'
import { logMissionPublishResult } from './rosbridgeConnectionLog'
import { tryPublishVersoSetMode, tryPublishVersoWaypoints } from './versoCommandBridge'
import type { VersoWaypoint } from './types'

export type BuildMissionWaypointsOptions = {
  checkoutNav?: boolean
}

export function buildVersoWaypointsFromScenarioKeys(keys: DemoBookKey[]): VersoWaypoint[] {
  return scenarioBookWaypoints(keys)
}

export function buildVersoWaypointsFromWorldGoals(
  goals: Point2[],
  options?: BuildMissionWaypointsOptions,
): VersoWaypoint[] {
  const checkoutNav = options?.checkoutNav ?? false
  return goals.map((goal, i) => {
    const robotCoord = worldXzToRobotMap(goal[0], goal[1])
    const isLastGoal = i === goals.length - 1
    const id = checkoutNav && isLastGoal ? 'checkout' : `wp_${i}`
    const waypoint: VersoWaypoint = { id, x: robotCoord.x, y: robotCoord.y }
    if (checkoutNav && isLastGoal) {
      waypoint.label = '계산대'
    }
    return waypoint
  })
}

export function buildWaypointLegMapping(
  waypoints: VersoWaypoint[],
): Map<string, number | 'checkout'> {
  const mapping = new Map<string, number | 'checkout'>()
  waypoints.forEach((wp, i) => {
    mapping.set(wp.id, wp.id === 'checkout' ? 'checkout' : i)
  })
  return mapping
}

export function tryPublishVersoMission(waypoints: VersoWaypoint[]): boolean {
  if (waypoints.length === 0) return false
  const waypointsOk = tryPublishVersoWaypoints(waypoints)
  const escortOk = waypointsOk ? tryPublishVersoSetMode('escort') : false
  logMissionPublishResult(waypoints, waypointsOk, escortOk)
  return waypointsOk && escortOk
}
