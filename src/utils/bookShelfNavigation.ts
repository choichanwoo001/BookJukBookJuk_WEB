import { pickMissionIndicesSeeded } from './missionPick'

export function clampPoolIndices(indices: number[], poolSize: number): number[] {
  if (poolSize <= 0) return []
  return indices.map((idx) => Math.max(0, Math.min(poolSize - 1, idx)))
}

export function resolveMissionPoolIndices(
  requested: number[],
  poolSize: number,
  fallbackVersion: number,
): number[] {
  const clamped = clampPoolIndices(requested, poolSize)
  if (clamped.length > 0) return clamped
  if (poolSize <= 0) return []
  const pool = Array.from({ length: poolSize }, (_, i) => i)
  return pickMissionIndicesSeeded(pool, fallbackVersion)
}
