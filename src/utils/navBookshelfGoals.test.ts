import { describe, expect, it } from 'vitest'
import {
  pillarRects,
  PLAYER_RADIUS_M,
} from '../data/floorPlan'
import { bookshelfOverlayLayerInstances, counterOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import { buildMissionShelfPool, buildNavBookshelfRects } from './missionShelfPool'
import { getMinimapWorldBounds } from './minimapBounds'
import {
  pickBookshelfGoalCandidatesWorld,
  pickReachableBookshelfGoalWorld,
} from './navBookshelfGoals'
import { pickCheckoutGoalFromWorld } from './counterNavigation'
import { findPathWorldGrid, isSegmentWalkableWorld, type WorldBounds } from './gridPathfinding'
import { createNavWalkabilityContext, isWalkablePoint, type WalkabilityContext } from './walkability'

function buildContext(): {
  ctx: WalkabilityContext
  bounds: WorldBounds
  pool: ReturnType<typeof buildMissionShelfPool>
} {
  const mainInstances: never[] = []
  const bounds = getMinimapWorldBounds()
  const navBounds = {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  }
  const ctx = createNavWalkabilityContext(
    buildNavBookshelfRects(mainInstances, bookshelfOverlayLayerInstances),
    { pillarRects, playerRadiusM: PLAYER_RADIUS_M },
  )
  return {
    ctx,
    bounds: navBounds,
    pool: buildMissionShelfPool(mainInstances, bookshelfOverlayLayerInstances),
  }
}

describe('nav bookshelf goals', () => {
  it('finds a walkable approach goal for every mission shelf', () => {
    const { ctx, bounds, pool } = buildContext()
    const failures: number[] = []

    for (let i = 0; i < pool.length; i++) {
      const inst = pool[i]
      const candidates = pickBookshelfGoalCandidatesWorld(inst, ctx, NAV_GRID_CELL_M, NAV_GOAL_MARGIN_M)
      const goal = pickReachableBookshelfGoalWorld(
        inst,
        null,
        ctx,
        bounds,
        NAV_GRID_CELL_M,
        NAV_GOAL_MARGIN_M,
      )
      if (
        candidates.length === 0 ||
        !goal ||
        !isWalkablePoint(ctx, goal[0], goal[1])
      ) {
        failures.push(i)
      }
    }

    expect(failures).toEqual([])
  }, 30_000)

  it('finds a reachable checkout approach goal from a shelf-side position', () => {
    const { ctx, bounds } = buildContext()
    const from: [number, number] = [-6.813732721703468, 4.034893318923967]
    const goal = pickCheckoutGoalFromWorld(from, ctx, bounds)

    if (counterOverlayLayerInstances.length === 0) {
      expect(goal).toBeNull()
      return
    }

    expect(goal).not.toBeNull()
    expect(goal && isWalkablePoint(ctx, goal[0], goal[1])).toBe(true)
    expect(
      goal &&
        (
          isSegmentWalkableWorld(from, goal, ctx, Math.max(0.08, NAV_GRID_CELL_M * 0.5)) ||
          Boolean(findPathWorldGrid(from, goal, ctx, bounds, NAV_GRID_CELL_M)?.length)
        ),
    ).toBe(true)
  }, 30_000)
})
