export type Point2Like = [number, number]

export function pointInPolygon2D(x: number, z: number, ring: Point2Like[]): boolean {
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const zi = ring[i][1]
    const xj = ring[j][0]
    const zj = ring[j][1]
    const crosses = (zi > z) !== (zj > z)
      && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function distanceToSegment2D(x: number, z: number, a: Point2Like, b: Point2Like): number {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const wx = x - a[0]
  const wz = z - a[1]
  const len2 = vx * vx + vz * vz
  if (len2 <= 1e-10) return Math.hypot(wx, wz)
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2))
  const px = a[0] + vx * t
  const pz = a[1] + vz * t
  return Math.hypot(x - px, z - pz)
}

export function pointInPolygonWithPadding(
  ring: Point2Like[],
  x: number,
  z: number,
  padding = 0,
): boolean {
  if (pointInPolygon2D(x, z, ring)) return true
  if (padding <= 0 || ring.length < 2) return false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (distanceToSegment2D(x, z, a, b) <= padding) return true
  }
  return false
}

export function pointInAnyPolygon(
  polygons: Point2Like[][],
  x: number,
  z: number,
  padding = 0,
): boolean {
  return polygons.some(poly => pointInPolygonWithPadding(poly, x, z, padding))
}
