import type { Point2 } from '../data/floorPlan'
import { counterOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import type { FixtureRenderInstance } from '../types/scene'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import { pickBookshelfGoalWorld } from './navBookshelfGoals'
import type { WalkabilityContext } from './walkability'
import { findPathWorldGrid, type WorldBounds } from './gridPathfinding'

export function getDefaultCheckoutCounter(): FixtureRenderInstance | null {
  return counterOverlayLayerInstances[0] ?? null
}

export function pickCounterGoalWorld(
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize = NAV_GRID_CELL_M,
  counter: FixtureRenderInstance = getDefaultCheckoutCounter()!,
): Point2 | null {
  if (!counter) return null
  return pickBookshelfGoalWorld(counter, ctx, bounds, cellSize, NAV_GOAL_MARGIN_M)
}

/** 이전 위치에서 도달 가능한 계산대 접근점을 고른다 (오버레이 계산대 후보 순회). */
export function pickCheckoutGoalFromWorld(
  from: Point2 | null,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize = NAV_GRID_CELL_M,
): Point2 | null {
  const goals: Point2[] = []
  for (const counter of counterOverlayLayerInstances) {
    const g = pickBookshelfGoalWorld(counter, ctx, bounds, cellSize, NAV_GOAL_MARGIN_M)
    if (g) goals.push(g)
  }
  if (goals.length === 0) return null
  if (!from) return goals[0]

  for (const g of goals) {
    const path = findPathWorldGrid(from, g, ctx, bounds, cellSize)
    if (path && path.length >= 2) return g
  }
  return goals[0]
}

export function checkoutDirectGoals(
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  from?: Point2 | null,
): Point2[] {
  const g = pickCheckoutGoalFromWorld(from ?? null, ctx, bounds)
  return g ? [g] : []
}
