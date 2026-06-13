import { describe, expect, it } from 'vitest'
import {
  buildFixtureRobotRoute,
  buildFixtureRoutePlanVisual,
  FIXTURE_ROBOT_TARGET_SPECS,
  fixtureRobotDirectGoals,
} from './fixtureRobotRoute'

describe('fixtureRobotRoute', () => {
  it('maps the selected floor circles to fixed fixture targets', () => {
    expect(FIXTURE_ROBOT_TARGET_SPECS.map((target) => ({
      id: target.id,
      fixtureSource: target.fixtureSource,
      fixtureIndex: target.fixtureIndex,
      purchased: target.purchased,
    }))).toEqual([
      {
        id: 'first-book',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: 14,
        purchased: true,
      },
      {
        id: 'second-book',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: 9,
        purchased: true,
      },
      {
        id: 'serendipity-browse',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: 26,
        purchased: false,
      },
      {
        id: 'final-recommendation',
        fixtureSource: 'bookshelfOverlayLayerInstances',
        fixtureIndex: 4,
        purchased: true,
      },
      {
        id: 'checkout',
        fixtureSource: 'counterOverlayLayerInstances',
        fixtureIndex: 1,
        purchased: false,
      },
    ])
  })

  it('builds a robot route from fixture approach goals', () => {
    const route = buildFixtureRobotRoute()

    expect(route.targets).toHaveLength(5)
    expect(route.targets.map((target) => target.fixtureCenter.map((v) => Number(v.toFixed(3))))).toEqual([
      [1.541, -12.115],
      [-7.347, 14.33],
      [4.297, 9.789],
      [-19.944, -4.428],
      [-6.194, 4.896],
    ])
    expect(route.worldPath.length).toBeGreaterThan(5)
    expect(route.versoPath.poses).toHaveLength(route.worldPath.length)
    expect(route.segmentEndDistancesM).toHaveLength(route.targets.length)
    expect(route.segmentEndDistancesM.at(-1)).toBeGreaterThan(0)
  }, 30_000)

  it('exposes direct goals aligned with route targets', () => {
    const route = buildFixtureRobotRoute()
    expect(fixtureRobotDirectGoals()).toEqual(route.targets.map((target) => target.approachGoal))
  }, 30_000)

  it('builds a full plan visual for overview preview', () => {
    const route = buildFixtureRobotRoute()
    const visual = buildFixtureRoutePlanVisual()

    expect(visual.planPath.length).toBeGreaterThan(5)
    expect(visual.dimPath).toEqual(visual.planPath)
    expect(visual.highlightPath).toEqual([])
    expect(visual.goals).toHaveLength(route.targets.length)
  }, 30_000)
})
