import { wallPolylines } from '../data/floorPlan'

function distPointToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const abLenSq = abx * abx + abz * abz
  if (abLenSq < 1e-12) return Math.hypot(apx, apz)
  let t = (apx * abx + apz * abz) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * abx
  const qz = az + t * abz
  return Math.hypot(px - qx, pz - qz)
}

export type NearestWallInfo = {
  /** Radians: wall runs along this direction in world XZ (atan2 of segment delta). */
  tangentYaw: number
  /** Radians: perpendicular to tangent in XZ (wall outward normal in horizontal plane, one of two). */
  normalYaw: number
  distM: number
}

/**
 * Finds the closest wall polyline segment to (cx, cz) and returns tangent yaw
 * so a shelf can be aligned parallel to the wall (long side along tangent).
 */
export function nearestWallInfo(cx: number, cz: number, loops = wallPolylines): NearestWallInfo | null {
  let bestDist = Infinity
  let bestAx = 0
  let bestAz = 0
  let bestBx = 0
  let bestBz = 0

  for (const loop of loops) {
    const n = loop.length
    if (n < 2) continue
    for (let i = 0; i < n; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % n]
      const d = distPointToSegment2D(cx, cz, a[0], a[1], b[0], b[1])
      if (d < bestDist) {
        bestDist = d
        bestAx = a[0]
        bestAz = a[1]
        bestBx = b[0]
        bestBz = b[1]
      }
    }
  }

  if (bestDist === Infinity) return null

  const dx = bestBx - bestAx
  const dz = bestBz - bestAz
  const tangentYaw = Math.atan2(dx, dz)
  const normalYaw = tangentYaw + Math.PI / 2
  return { tangentYaw, normalYaw, distM: bestDist }
}
