import type { FixtureRenderInstance } from '../types/scene'

/**
 * Selection circle in xz; a shelf counts if its center is within
 * `radius + max(w,d)/2` of (centerX, centerZ).
 * Returns the index of the shelf whose center is nearest to the circle center, or null.
 */
export function findNearestBookshelfInCircle(
  centerX: number,
  centerZ: number,
  radiusM: number,
  instances: FixtureRenderInstance[],
): number | null {
  let bestIndex: number | null = null
  let bestDist = Infinity

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const margin = Math.max(inst.w, inst.d) * 0.5
    const maxDist = radiusM + margin
    const dx = inst.cx - centerX
    const dz = inst.cz - centerZ
    const dist = Math.hypot(dx, dz)
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }

  return bestIndex
}

/**
 * 폴리곤 병합 책장 메시 등 `instanceId`가 없을 때: 월드 xz에 가장 가까운 책장 인덱스.
 * 클릭이 책장 면 근처일 때만 고르도록 반경을 `max(w,d)` 기반으로 둔다.
 */
export function findNearestBookshelfIndexAtXZ(
  x: number,
  z: number,
  instances: FixtureRenderInstance[],
): number | null {
  let bestIndex: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const half = Math.max(inst.w, inst.d) * 0.5 + 0.35
    const dx = inst.cx - x
    const dz = inst.cz - z
    const dist = Math.hypot(dx, dz)
    if (dist <= half && dist < bestDist) {
      bestDist = dist
      bestIndex = i
    }
  }
  return bestIndex
}
