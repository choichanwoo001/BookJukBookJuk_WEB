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
