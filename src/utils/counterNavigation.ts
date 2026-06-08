import type { Point2 } from '../data/floorPlan'
import { counterOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import type { FixtureRenderInstance } from '../types/scene'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import { pickBookshelfGoalWorld } from './navBookshelfGoals'
import type { WalkabilityContext } from './walkability'
import type { WorldBounds } from './gridPathfinding'

export function getDefaultCheckoutCounter(): FixtureRenderInstance | null {
  return counterOverlayLayerInstances[0] ?? null
}

export function pickCounterGoalWorld(
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize = NAV_GRID_CELL_M,
): Point2 | null {
  const counter = getDefaultCheckoutCounter()
  if (!counter) return null
  return pickBookshelfGoalWorld(counter, ctx, bounds, cellSize, NAV_GOAL_MARGIN_M)
}

export function checkoutDirectGoals(
  ctx: WalkabilityContext,
  bounds: WorldBounds,
): Point2[] {
  const g = pickCounterGoalWorld(ctx, bounds)
  return g ? [g] : []
}
