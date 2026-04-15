import type { FixtureRenderInstance } from '../types/scene'
import type { WalkabilityContext } from './walkability'
import { isWalkablePoint } from './walkability'
import { findNearestWalkableWorldPoint } from './gridPathfinding'
import type { WorldBounds } from './gridPathfinding'

/** 로컬 +Z 면 바깥(통로 쪽) 후보 두 곳 — 회전에 맞춰 월드 xz. */
export function approachPointCandidates(inst: FixtureRenderInstance, marginM: number): [number, number][] {
  const { cx, cz, d, yaw } = inst
  const L = d * 0.5 + marginM
  const dx = Math.sin(yaw) * L
  const dz = Math.cos(yaw) * L
  return [
    [cx + dx, cz + dz],
    [cx - dx, cz - dz],
  ]
}

export function pickBookshelfGoalWorld(
  inst: FixtureRenderInstance,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
  marginM: number,
): [number, number] | null {
  const candidates = [...approachPointCandidates(inst, marginM), [inst.cx, inst.cz] as [number, number]]
  for (const [x, z] of candidates) {
    const snapped = findNearestWalkableWorldPoint(x, z, ctx, bounds, cellSize, 96)
    if (snapped && isWalkablePoint(ctx, snapped[0], snapped[1])) return snapped
  }
  return null
}
