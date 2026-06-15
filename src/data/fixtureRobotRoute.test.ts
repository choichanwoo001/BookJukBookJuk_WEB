import { describe, expect, it } from 'vitest'
import { DEMO_BOOKS } from './demoScenario'
import {
  buildFixtureRobotRoute,
  buildFixtureRoutePlanVisual,
  EXTENDED_SCENARIO_SPECS,
  extendedFixtureRobotDirectGoals,
  fixtureRobotDirectGoals,
  INITIAL_SCENARIO_SPECS,
  resolveFixtureBookForShelfArrival,
  resolveFixtureBookKeyForLeg,
  resolveFixtureRouteSpecs,
  resolveScenarioWaypointsForGoals,
  scenarioBookWaypoints,
  SERENDIPITY_BROWSE_TARGET_SPEC,
  SERENDIPITY_DETOUR_SPECS,
  serendipityOnlyDirectGoals,
} from './fixtureRobotRoute'

describe('fixtureRobotRoute', () => {
  it('defines initial route as 오직 두 사람 only', () => {
    expect(INITIAL_SCENARIO_SPECS).toHaveLength(1)
    expect(INITIAL_SCENARIO_SPECS[0]?.fixtureIndex).toBe(DEMO_BOOKS.book2.poolIndex)
  })

  it('uses 단 한 사람 for serendipity browse detour', () => {
    expect(SERENDIPITY_BROWSE_TARGET_SPEC.label).toBe(DEMO_BOOKS.serendipity.title)
    expect(SERENDIPITY_BROWSE_TARGET_SPEC.kind).toBe('browse')
    expect(SERENDIPITY_BROWSE_TARGET_SPEC.fixtureIndex).toBe(DEMO_BOOKS.serendipity.poolIndex)
    expect(SERENDIPITY_BROWSE_TARGET_SPEC.originalCircle).toEqual({
      x: 2.825,
      z: 9.418,
      radius: 0.35,
    })
  })

  it('builds serendipity-only direct goals as a single serendipity stop', () => {
    const goals = serendipityOnlyDirectGoals()
    expect(goals).toHaveLength(1)
  }, 30_000)

  it('builds extended route as book2 then book1', () => {
    expect(EXTENDED_SCENARIO_SPECS.map((s) => s.label)).toEqual([
      DEMO_BOOKS.book2.title,
      DEMO_BOOKS.book1.title,
    ])
    const goals = extendedFixtureRobotDirectGoals()
    expect(goals).toHaveLength(2)
  }, 30_000)

  it('resolves route specs from mission pool indices', () => {
    expect(resolveFixtureRouteSpecs([DEMO_BOOKS.book2.poolIndex])).toEqual(INITIAL_SCENARIO_SPECS)
    expect(resolveFixtureRouteSpecs([
      DEMO_BOOKS.book2.poolIndex,
      DEMO_BOOKS.book1.poolIndex,
    ])).toEqual(EXTENDED_SCENARIO_SPECS)
    expect(resolveFixtureRouteSpecs([
      DEMO_BOOKS.serendipity.poolIndex,
      DEMO_BOOKS.book2.poolIndex,
    ])).toEqual(SERENDIPITY_DETOUR_SPECS)
  })

  it('maps fixture legs to demo book keys', () => {
    expect(resolveFixtureBookKeyForLeg(0)).toBe('book2')
    expect(resolveFixtureBookKeyForLeg(1)).toBeNull()
  })

  it('resolves shelf arrival by pool index across route variants', () => {
    expect(
      resolveFixtureBookForShelfArrival({
        legIndex: 0,
        poolIndex: DEMO_BOOKS.book2.poolIndex,
      }),
    ).toBe('book2')
    expect(
      resolveFixtureBookForShelfArrival({
        legIndex: 0,
        poolIndex: DEMO_BOOKS.serendipity.poolIndex,
        specs: SERENDIPITY_DETOUR_SPECS,
      }),
    ).toBe('serendipity')
  })

  it('builds a robot route from fixture approach goals', () => {
    const route = buildFixtureRobotRoute()

    expect(route.targets).toHaveLength(1)
    expect(route.targets[0]?.label).toBe(DEMO_BOOKS.book2.title)
    expect(route.worldPath.length).toBeGreaterThan(3)
    expect(route.versoPath.poses).toHaveLength(route.worldPath.length)
    expect(route.segmentEndDistancesM).toHaveLength(route.targets.length)
    expect(route.segmentEndDistancesM.at(-1)).toBeGreaterThan(0)
  }, 30_000)

  it('exposes direct goals aligned with route targets', () => {
    const route = buildFixtureRobotRoute()
    expect(fixtureRobotDirectGoals()).toEqual(route.targets.map((target) => target.approachGoal))
  }, 30_000)

  it('builds labeled scenario waypoints for robot publish', () => {
    const waypoints = scenarioBookWaypoints(['book2'])
    expect(waypoints).toHaveLength(1)
    expect(waypoints[0]?.label).toBe(DEMO_BOOKS.book2.title)
    expect(waypoints[0]?.id).toBe('book2')
    expect(waypoints[0]?.x).toBe(-24.117)
    expect(waypoints[0]?.y).toBe(-8.361)
  }, 30_000)

  it('matches scenario waypoints from dispatched goals', () => {
    const initial = fixtureRobotDirectGoals()
    const matched = resolveScenarioWaypointsForGoals(initial)
    expect(matched?.map((wp) => wp.label)).toEqual([DEMO_BOOKS.book2.title])
  }, 30_000)

  it('builds a full plan visual for overview preview', () => {
    const route = buildFixtureRobotRoute()
    const visual = buildFixtureRoutePlanVisual()

    expect(visual.planPath.length).toBeGreaterThan(3)
    expect(visual.dimPath).toEqual(visual.planPath)
    expect(visual.highlightPath).toEqual([])
    expect(visual.goals).toHaveLength(route.targets.length)
  }, 30_000)
})
