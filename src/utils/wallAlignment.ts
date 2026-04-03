import { floorRects, wallPolylines } from '../data/floorPlan'
import { getFloorOuterAndHolePolygons, isPointInRingedPolygon } from './floorPolygon'
import { pointInAnyRect } from './rectUtils'

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

function closestPointOnSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const abLenSq = abx * abx + abz * abz
  if (abLenSq < 1e-12) return { x: ax, z: az }
  let t = (apx * abx + apz * abz) / abLenSq
  t = Math.max(0, Math.min(1, t))
  return { x: ax + t * abx, z: az + t * abz }
}

/**
 * Closest point on any wall polyline segment to (px, pz) in XZ.
 */
export function closestPointOnWallPolylines(
  px: number,
  pz: number,
  loops = wallPolylines,
): { x: number; z: number } | null {
  let bestDistSq = Infinity
  let bestX = 0
  let bestZ = 0

  for (const loop of loops) {
    const n = loop.length
    if (n < 2) continue
    for (let i = 0; i < n; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % n]
      const q = closestPointOnSegment2D(px, pz, a[0], a[1], b[0], b[1])
      const d = (px - q.x) ** 2 + (pz - q.z) ** 2
      if (d < bestDistSq) {
        bestDistSq = d
        bestX = q.x
        bestZ = q.z
      }
    }
  }

  if (bestDistSq === Infinity) return null
  return { x: bestX, z: bestZ }
}

const floorPolyCache = getFloorOuterAndHolePolygons(wallPolylines)

function isWalkableFloor(x: number, z: number): boolean {
  if (floorPolyCache.outer.length >= 3) {
    return isPointInRingedPolygon(x, z, floorPolyCache.outer, floorPolyCache.holes)
  }
  return pointInAnyRect(floorRects, x, z)
}

export type NearestWallSegmentHit = {
  x: number
  z: number
  ax: number
  az: number
  bx: number
  bz: number
}

/**
 * Closest point on wall polylines and the segment it lies on (for normals / inside test).
 */
export function closestWallSegmentToPoint(
  px: number,
  pz: number,
  loops = wallPolylines,
): NearestWallSegmentHit | null {
  let bestDistSq = Infinity
  let bestX = 0
  let bestZ = 0
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
      const q = closestPointOnSegment2D(px, pz, a[0], a[1], b[0], b[1])
      const d = (px - q.x) ** 2 + (pz - q.z) ** 2
      if (d < bestDistSq) {
        bestDistSq = d
        bestX = q.x
        bestZ = q.z
        bestAx = a[0]
        bestAz = a[1]
        bestBx = b[0]
        bestBz = b[1]
      }
    }
  }

  if (bestDistSq === Infinity) return null
  return { x: bestX, z: bestZ, ax: bestAx, az: bestAz, bx: bestBx, bz: bestBz }
}

/**
 * Picks the horizontal normal (unit XZ) pointing from the wall segment into walkable floor
 * (not the unknown/outside side). Uses two perpendiculars to the segment.
 */
function inwardNormalTowardWalkableFloor(
  hit: NearestWallSegmentHit,
  hintCx: number,
  hintCz: number,
): { nx: number; nz: number } {
  const dx = hit.bx - hit.ax
  const dz = hit.bz - hit.az
  const len = Math.hypot(dx, dz)
  if (len < 1e-12) return { nx: 0, nz: 1 }

  const nx1 = -dz / len
  const nz1 = dx / len
  const nx2 = dz / len
  const nz2 = -dx / len

  const eps = 0.18
  const t1 = isWalkableFloor(hit.x + nx1 * eps, hit.z + nz1 * eps)
  const t2 = isWalkableFloor(hit.x + nx2 * eps, hit.z + nz2 * eps)

  const hx = hintCx - hit.x
  const hz = hintCz - hit.z
  const dot1 = hx * nx1 + hz * nz1
  const dot2 = hx * nx2 + hz * nz2

  if (t1 && !t2) return { nx: nx1, nz: nz1 }
  if (t2 && !t1) return { nx: nx2, nz: nz2 }
  if (t1 && t2) return dot1 >= dot2 ? { nx: nx1, nz: nz1 } : { nx: nx2, nz: nz2 }

  return dot1 >= dot2 ? { nx: nx1, nz: nz1 } : { nx: nx2, nz: nz2 }
}

/**
 * Moves shelf center so the back face (local −Z, depth d) sits on the nearest wall segment,
 * opening into walkable floor. Sets yaw so depth points from back toward room interior.
 * RotatedFixtureInstances: back midpoint at (cx − sin(yaw)·d/2, cz − cos(yaw)·d/2),
 * inward from back = (sin(yaw), cos(yaw)) in XZ.
 */
export function snapBookshelfCenterFlushToWall(
  cx: number,
  cz: number,
  _yaw: number,
  d: number,
  loops = wallPolylines,
): { cx: number; cz: number; yaw: number } {
  const half = d * 0.5
  const hit = closestWallSegmentToPoint(cx, cz, loops)
  if (!hit) return { cx, cz, yaw: _yaw }

  const { nx, nz } = inwardNormalTowardWalkableFloor(hit, cx, cz)
  const yaw = Math.atan2(nx, nz)

  return {
    cx: hit.x + nx * half,
    cz: hit.z + nz * half,
    yaw,
  }
}

/**
 * 같은 복도 양벽에 선 책장 쌍이 서로 정면으로 마주보도록, 각 중심을 벽 접선 방향으로만 미세 이동.
 * 이미 snapBookshelfCenterFlushToWall로 벽·yaw가 맞은 뒤 호출한다.
 */
export function alignBookshelfPairsFacingAcrossAisle<
  T extends { cx: number; cz: number; yaw: number },
>(instances: T[]): T[] {
  if (instances.length < 2) return instances.map((r) => ({ ...r }))

  const sortedByYaw = [...instances].sort((a, b) => a.yaw - b.yaw)
  let bestGap = -1
  let splitAt = 0
  for (let i = 0; i < sortedByYaw.length - 1; i++) {
    const gap = sortedByYaw[i + 1].yaw - sortedByYaw[i].yaw
    if (gap > bestGap) {
      bestGap = gap
      splitAt = i
    }
  }
  /** No clear opposing-wall cluster (e.g. all same yaw) — skip. */
  if (bestGap < 0.5) return instances.map((r) => ({ ...r }))

  const gA = sortedByYaw.slice(0, splitAt + 1)
  const gB = sortedByYaw.slice(splitAt + 1)
  if (gA.length === 0 || gB.length === 0) return instances.map((r) => ({ ...r }))

  const yawRef = gA[0].yaw
  /** Unit tangent along wall (XZ), perpendicular to inward normal (sin(yaw), cos(yaw)). */
  const tx = -Math.cos(yawRef)
  const tz = Math.sin(yawRef)

  const proj = (p: T) => p.cx * tx + p.cz * tz
  const gAs = [...gA].sort((a, b) => proj(a) - proj(b))
  const gBs = [...gB].sort((a, b) => proj(a) - proj(b))
  const n = Math.min(gAs.length, gBs.length)

  const out = new Map<T, T>()
  for (const r of instances) out.set(r, { ...r })

  for (let i = 0; i < n; i++) {
    const a = gAs[i]
    const b = gBs[i]
    const curA = out.get(a)!
    const curB = out.get(b)!
    const dx = curB.cx - curA.cx
    const dz = curB.cz - curA.cz
    const dotT = dx * tx + dz * tz
    const half = dotT * 0.5
    curA.cx += half * tx
    curA.cz += half * tz
    curB.cx -= half * tx
    curB.cz -= half * tz
  }

  return instances.map((r) => out.get(r)!)
}
