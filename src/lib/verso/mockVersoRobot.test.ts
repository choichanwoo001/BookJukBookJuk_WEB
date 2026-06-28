import { describe, expect, it } from 'vitest'
import { buildFixtureRobotRoute, FIXTURE_ROBOT_TARGET_SPECS } from '../../data/fixtureRobotRoute'
import { ENTRANCE_SPAWN } from '../../data/floorPlan'
import { worldXzToRobotMap } from '../../utils/robotMapCoords'
import {
  applyMockCommand,
  applyMockSetMode,
  applyMockWaypoints,
  buildMockMissionFromWaypoints,
  createMockVersoRobotState,
  tickMockVersoRobot,
} from './mockVersoRobot'
import type { VersoWaypoint } from './types'

function waypointsFromFixtureSpecs(): VersoWaypoint[] {
  const route = buildFixtureRobotRoute(FIXTURE_ROBOT_TARGET_SPECS)
  return route.targets.map((target, i) => {
    const map = worldXzToRobotMap(target.approachGoal[0], target.approachGoal[1])
    return { id: `wp_${i}`, x: map.x, y: map.y, label: target.label }
  })
}

describe('mockVersoRobot', () => {
  it('builds mission path from waypoints', () => {
    const [wp] = waypointsFromFixtureSpecs()
    const mission = buildMockMissionFromWaypoints([wp], [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]])
    expect(mission).not.toBeNull()
    expect(mission!.worldPath.length).toBeGreaterThanOrEqual(2)
    expect(mission!.versoPath.poses.length).toBe(mission!.worldPath.length)
    expect(mission!.segmentEndDistancesM.length).toBe(1)
  })

  it('emits waypoint_arrived once per segment and waits for resume', () => {
    const state = createMockVersoRobotState()
    const [wp] = waypointsFromFixtureSpecs()
    const path = applyMockWaypoints(state, [wp])
    expect(path).not.toBeNull()
    expect(state.mode).toBe('escort')

    let arrivedEvent: { event: string } | null = null
    let t = 1000
    for (let i = 0; i < 500; i += 1) {
      t += 16
      const result = tickMockVersoRobot(state, t, { speedMps: 5, statusIntervalMs: 1000 })
      if (result.event?.event === 'waypoint_arrived') {
        arrivedEvent = result.event
        break
      }
    }
    expect(arrivedEvent).not.toBeNull()
    expect(arrivedEvent?.event).toBe('waypoint_arrived')
    expect(state.arrivalPaused).toBe(true)
    expect(state.paused).toBe(true)

    applyMockCommand(state, 'resume')
    expect(state.paused).toBe(false)
    expect(state.arrivalPaused).toBe(false)
  })

  it('guidance clears mission and escort restores from stored waypoints', () => {
    const state = createMockVersoRobotState()
    const testWaypoints = waypointsFromFixtureSpecs()
    applyMockWaypoints(state, testWaypoints)
    expect(state.mission).not.toBeNull()

    applyMockSetMode(state, 'guidance')
    expect(state.mission).toBeNull()
    expect(state.mode).toBe('guidance')
    expect(state.storedWaypoints).toEqual([])

    state.storedWaypoints = testWaypoints.slice()
    applyMockSetMode(state, 'escort')
    expect(state.mode).toBe('escort')
    expect(state.mission).not.toBeNull()
  })

  it('stop pauses without clearing mission', () => {
    const state = createMockVersoRobotState()
    applyMockWaypoints(state, waypointsFromFixtureSpecs())
    applyMockCommand(state, 'stop')
    expect(state.paused).toBe(true)
    expect(state.mission).not.toBeNull()
  })
})
