import type { Point2 } from '../data/floorPlan'

export type PathSample = {
  point: Point2
  headingRad: number
  segmentIndex: number
}

export function pathLengthM(path: Point2[]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    sum += Math.hypot(bx - ax, bz - az)
  }
  return sum
}

/**
 * Sample a point along a polyline at the given arc-length distance (m).
 * Clamps to path ends when distance is out of range.
 */
export function samplePathAtDistance(path: Point2[], distanceM: number): PathSample | null {
  if (path.length === 0) return null
  if (path.length === 1) {
    return { point: [path[0][0], path[0][1]], headingRad: 0, segmentIndex: 0 }
  }

  const total = pathLengthM(path)
  const clamped = Math.max(0, Math.min(distanceM, total))
  let traversed = 0

  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    const segLen = Math.hypot(bx - ax, bz - az)
    if (segLen <= 0) continue

    if (traversed + segLen >= clamped) {
      const t = (clamped - traversed) / segLen
      const x = ax + (bx - ax) * t
      const z = az + (bz - az) * t
      return {
        point: [x, z],
        headingRad: Math.atan2(bx - ax, bz - az),
        segmentIndex: i - 1,
      }
    }
    traversed += segLen
  }

  const last = path[path.length - 1]
  const prev = path[path.length - 2]
  return {
    point: [last[0], last[1]],
    headingRad: Math.atan2(last[0] - prev[0], last[1] - prev[1]),
    segmentIndex: path.length - 2,
  }
}

/**
 * Project a world XZ point onto a polyline and return the arc-length distance (m)
 * to the closest point on the path.
 */
export function projectPointOntoPathDistance(path: Point2[], point: Point2): number {
  if (path.length < 2) return 0

  const [px, pz] = point
  let bestDistance = 0
  let bestDistSq = Infinity
  let traversed = 0

  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    const dx = bx - ax
    const dz = bz - az
    const segLenSq = dx * dx + dz * dz
    if (segLenSq <= 0) continue

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / segLenSq))
    const cx = ax + dx * t
    const cz = az + dz * t
    const distSq = (px - cx) ** 2 + (pz - cz) ** 2
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestDistance = traversed + Math.sqrt(segLenSq) * t
    }
    traversed += Math.sqrt(segLenSq)
  }

  return bestDistance
}

/** Heading (rad) along the path tangent at the closest point to `point`. */
export function pathHeadingAtPoint(path: Point2[], point: Point2): number | null {
  if (path.length < 2) return null
  const distance = projectPointOntoPathDistance(path, point)
  return samplePathAtDistance(path, distance)?.headingRad ?? null
}
