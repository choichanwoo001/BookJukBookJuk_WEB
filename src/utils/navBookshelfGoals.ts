import type { FixtureRenderInstance } from '../types/scene'
import type { WalkabilityContext } from './walkability'
import { isWalkablePoint } from './walkability'
import {
  findPathWorldGrid,
  isSegmentWalkableWorld,
  type WorldBounds,
} from './gridPathfinding'

export type ApproachGoalCandidate = {
  goal: [number, number]
  side: -1 | 1
  lateralOffsetM: number
}

/** Local +/-Z approach points in front of both depth faces. */
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

function uniqueSortedOffsets(widthM: number): number[] {
  const half = Math.max(0, widthM * 0.5 - 0.18)
  const raw = [0]
  const stepM = 0.35
  for (let offset = stepM; offset <= half + 1e-6; offset += stepM) {
    raw.push(offset, -offset)
  }
  if (half > 0) raw.push(half, -half)
  return [...new Set(raw.map((n) => Number(n.toFixed(3))))].filter((n) => Math.abs(n) <= half)
}

function pathLengthM(path: [number, number][]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) {
    sum += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
  }
  return sum
}

export function pickBookshelfGoalCandidatesWorld(
  inst: FixtureRenderInstance,
  ctx: WalkabilityContext,
  cellSize: number,
  marginM: number,
): ApproachGoalCandidate[] {
  const normal: [number, number] = [Math.sin(inst.yaw), Math.cos(inst.yaw)]
  const tangent: [number, number] = [Math.cos(inst.yaw), -Math.sin(inst.yaw)]
  const candidates: ApproachGoalCandidate[] = []
  const offsets = uniqueSortedOffsets(inst.w)
  const stepM = Math.max(0.08, Math.min(cellSize * 0.5, 0.16))
  const maxExtraM = 2.2

  for (const side of [1, -1] as const) {
    for (const lateralOffsetM of offsets) {
      const baseX = inst.cx + tangent[0] * lateralOffsetM
      const baseZ = inst.cz + tangent[1] * lateralOffsetM
      const baseDist = inst.d * 0.5 + marginM
      const anchor: [number, number] = [
        baseX + normal[0] * side * baseDist,
        baseZ + normal[1] * side * baseDist,
      ]

      for (let extra = 0; extra <= maxExtraM + 1e-6; extra += stepM) {
        const dist = baseDist + extra
        const goal: [number, number] = [
          baseX + normal[0] * side * dist,
          baseZ + normal[1] * side * dist,
        ]

        if (!isWalkablePoint(ctx, goal[0], goal[1])) {
          continue
        }

        if (
          isWalkablePoint(ctx, anchor[0], anchor[1])
          && !isSegmentWalkableWorld(anchor, goal, ctx, stepM)
        ) {
          continue
        }

        candidates.push({ goal, side, lateralOffsetM })
        break
      }
    }
  }

  const normalOffsets = [
    0,
    Math.min(inst.d * 0.5 + 0.15, 0.4),
    -Math.min(inst.d * 0.5 + 0.15, 0.4),
  ]
  for (const side of [1, -1] as const) {
    for (const normalOffsetM of normalOffsets) {
      const baseX = inst.cx + normal[0] * normalOffsetM
      const baseZ = inst.cz + normal[1] * normalOffsetM
      const baseDist = inst.w * 0.5 + marginM

      for (let extra = 0; extra <= maxExtraM + 1e-6; extra += stepM) {
        const dist = baseDist + extra
        const goal: [number, number] = [
          baseX + tangent[0] * side * dist,
          baseZ + tangent[1] * side * dist,
        ]
        if (!isWalkablePoint(ctx, goal[0], goal[1])) continue
        candidates.push({ goal, side, lateralOffsetM: side * (inst.w * 0.5) })
        break
      }
    }
  }

  return candidates
}

export function pickReachableBookshelfGoalWorld(
  inst: FixtureRenderInstance,
  from: [number, number] | null,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
  marginM: number,
): [number, number] | null {
  const candidates = pickBookshelfGoalCandidatesWorld(inst, ctx, cellSize, marginM)
  if (candidates.length === 0) return null
  if (!from) return candidates[0].goal

  const nearbyCandidates = [...candidates]
    .sort((a, b) => {
      const da = Math.hypot(a.goal[0] - from[0], a.goal[1] - from[1])
      const db = Math.hypot(b.goal[0] - from[0], b.goal[1] - from[1])
      return da - db
    })
  const pathCheckedCandidates = nearbyCandidates.slice(0, 2)

  let best: { goal: [number, number]; distance: number } | null = null
  for (const candidate of nearbyCandidates) {
    if (isSegmentWalkableWorld(from, candidate.goal, ctx, Math.max(0.08, cellSize * 0.5))) {
      const distance = Math.hypot(candidate.goal[0] - from[0], candidate.goal[1] - from[1])
      if (!best || distance < best.distance) {
        best = { goal: candidate.goal, distance }
      }
      continue
    }
  }

  if (best) return best.goal

  for (const candidate of pathCheckedCandidates) {
    const path = findPathWorldGrid(from, candidate.goal, ctx, bounds, cellSize)
    if (path && path.length >= 2) {
      const distance = pathLengthM(path)
      if (!best || distance < best.distance) {
        best = { goal: candidate.goal, distance }
      }
    }
  }

  return best?.goal ?? nearbyCandidates[0]?.goal ?? candidates[0].goal
}

export function pickBookshelfGoalWorld(
  inst: FixtureRenderInstance,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
  marginM: number,
): [number, number] | null {
  return pickReachableBookshelfGoalWorld(inst, null, ctx, bounds, cellSize, marginM)
}
