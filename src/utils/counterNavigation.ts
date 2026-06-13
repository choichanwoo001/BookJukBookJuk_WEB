import type { Point2 } from '../data/floorPlan'
import { counterOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import type { FixtureRenderInstance } from '../types/scene'
import { NAV_GOAL_MARGIN_M, NAV_GRID_CELL_M } from '../config/constants'
import {
  pickBookshelfGoalCandidatesWorld,
  pickBookshelfGoalWorld,
  pickReachableBookshelfGoalWorld,
} from './navBookshelfGoals'
import type { WalkabilityContext } from './walkability'
import { findPathWorldGrid, isSegmentWalkableWorld, type WorldBounds } from './gridPathfinding'

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
    const candidates = from
      ? pickBookshelfGoalCandidatesWorld(counter, ctx, cellSize, NAV_GOAL_MARGIN_M)
        .sort((a, b) => {
          const da = Math.hypot(a.goal[0] - from[0], a.goal[1] - from[1])
          const db = Math.hypot(b.goal[0] - from[0], b.goal[1] - from[1])
          return da - db
        })
      : []
    const direct = from
      ? candidates.find((candidate) =>
        isSegmentWalkableWorld(from, candidate.goal, ctx, Math.max(0.08, cellSize * 0.5)),
      )
      : null
    const routed = from && !direct
      ? candidates.slice(0, 2).find((candidate) =>
        {
          const path = findPathWorldGrid(from, candidate.goal, ctx, bounds, cellSize)
          return Boolean(path && path.length >= 2)
        },
      )
      : null
    const reachable = direct?.goal ?? routed?.goal
    const g = reachable ?? pickReachableBookshelfGoalWorld(
      counter,
      from,
      ctx,
      bounds,
      cellSize,
      NAV_GOAL_MARGIN_M,
    )
    if (g) goals.push(g)
  }
  if (goals.length === 0) return null
  if (!from) return goals[0]

  for (const g of goals) {
    if (isSegmentWalkableWorld(from, g, ctx, Math.max(0.08, cellSize * 0.5))) return g
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
