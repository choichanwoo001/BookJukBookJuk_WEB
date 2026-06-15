import { FLOOR_INCLUSION_PADDING_M, floorRenderRects, wallPolylines } from '../data/floorPlan'
import { createRectPointIndex } from './rectUtils'

// ─── Geometry helpers ────────────────────────────────────────────────────────

/**
 * Projects point P onto segment AB, returns clamped t ∈ [0,1]
 * and the closest point Q on the segment.
 */
function projectOntoSegment2D(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): { t: number; qx: number; qz: number } {
  const abx = bx - ax
  const abz = bz - az
  const abLenSq = abx * abx + abz * abz
  if (abLenSq < 1e-12) return { t: 0, qx: ax, qz: az }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq))
  return { t, qx: ax + t * abx, qz: az + t * abz }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type NearestWallInfo = {
  /** Radians: wall runs along this direction in world XZ (atan2 of segment delta). */
  tangentYaw: number
  /** Radians: perpendicular to tangent in XZ (wall outward normal). */
  normalYaw: number
  distM: number
}

export type NearestWallSegmentHit = {
  x: number
  z: number
  ax: number
  az: number
  bx: number
  bz: number
}

// ─── Core search: finds the closest wall segment ──────────────────────────────

/**
 * Closest point on wall polylines and the segment it lies on.
 * All other wall-search functions are derived from this.
 */
export function closestWallSegmentToPoint(
  px: number,
  pz: number,
  loops = wallPolylines,
): NearestWallSegmentHit | null {
  let bestDistSq = Infinity
  let bestX = 0, bestZ = 0
  let bestAx = 0, bestAz = 0, bestBx = 0, bestBz = 0

  for (const loop of loops) {
    const n = loop.length
    if (n < 2) continue
    for (let i = 0; i < n; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % n]
      const { qx, qz } = projectOntoSegment2D(px, pz, a[0], a[1], b[0], b[1])
      const d = (px - qx) ** 2 + (pz - qz) ** 2
      if (d < bestDistSq) {
        bestDistSq = d
        bestX = qx; bestZ = qz
        bestAx = a[0]; bestAz = a[1]
        bestBx = b[0]; bestBz = b[1]
      }
    }
  }

  if (bestDistSq === Infinity) return null
  return { x: bestX, z: bestZ, ax: bestAx, az: bestAz, bx: bestBx, bz: bestBz }
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/**
 * Finds the closest wall segment and returns tangent/normal yaw for shelf alignment.
 */
export function nearestWallInfo(cx: number, cz: number, loops = wallPolylines): NearestWallInfo | null {
  const hit = closestWallSegmentToPoint(cx, cz, loops)
  if (!hit) return null
  const dx = hit.bx - hit.ax
  const dz = hit.bz - hit.az
  const tangentYaw = Math.atan2(dx, dz)
  return { tangentYaw, normalYaw: tangentYaw + Math.PI / 2, distM: Math.hypot(cx - hit.x, cz - hit.z) }
}

/**
 * Closest point (XZ) on any wall polyline segment to (px, pz).
 */
export function closestPointOnWallPolylines(
  px: number,
  pz: number,
  loops = wallPolylines,
): { x: number; z: number } | null {
  const hit = closestWallSegmentToPoint(px, pz, loops)
  return hit ? { x: hit.x, z: hit.z } : null
}

// ─── Wall-snap helpers ────────────────────────────────────────────────────────

const floorContainsPoint = createRectPointIndex(floorRenderRects)

function isWalkableFloor(x: number, z: number): boolean {
  return floorContainsPoint(x, z, FLOOR_INCLUSION_PADDING_M)
}

/**
 * Returns the unit normal (XZ) of the given wall segment pointing toward walkable floor.
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

  const nx1 = -dz / len; const nz1 = dx / len
  const nx2 = dz / len;  const nz2 = -dx / len

  const eps = 0.18
  const t1 = isWalkableFloor(hit.x + nx1 * eps, hit.z + nz1 * eps)
  const t2 = isWalkableFloor(hit.x + nx2 * eps, hit.z + nz2 * eps)

  const dot1 = (hintCx - hit.x) * nx1 + (hintCz - hit.z) * nz1
  const dot2 = (hintCx - hit.x) * nx2 + (hintCz - hit.z) * nz2

  if (t1 && !t2) return { nx: nx1, nz: nz1 }
  if (t2 && !t1) return { nx: nx2, nz: nz2 }
  return dot1 >= dot2 ? { nx: nx1, nz: nz1 } : { nx: nx2, nz: nz2 }
}

/**
 * Moves shelf center so the back face (local −Z, depth d) sits flush on the nearest wall,
 * opening toward walkable floor. Sets yaw so depth points from back toward room interior.
 */
export function snapBookshelfCenterFlushToWall(
  cx: number,
  cz: number,
  _yaw: number,
  d: number,
  loops = wallPolylines,
): { cx: number; cz: number; yaw: number } {
  const hit = closestWallSegmentToPoint(cx, cz, loops)
  if (!hit) return { cx, cz, yaw: _yaw }

  const { nx, nz } = inwardNormalTowardWalkableFloor(hit, cx, cz)
  const half = d * 0.5
  return {
    cx: hit.x + nx * half,
    cz: hit.z + nz * half,
    yaw: Math.atan2(nx, nz),
  }
}

// ─── Cluster alignment ────────────────────────────────────────────────────────

/**
 * 같은 복도 양벽에 선 책장 쌍이 서로 정면으로 마주보도록, 각 중심을 벽 접선 방향으로만 미세 이동.
 * snapBookshelfCenterFlushToWall 적용 후 호출한다.
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
    if (gap > bestGap) { bestGap = gap; splitAt = i }
  }
  if (bestGap < 0.5) return instances.map((r) => ({ ...r }))

  const gA = sortedByYaw.slice(0, splitAt + 1)
  const gB = sortedByYaw.slice(splitAt + 1)
  if (gA.length === 0 || gB.length === 0) return instances.map((r) => ({ ...r }))

  const yawRef = gA[0].yaw
  const tx = -Math.cos(yawRef)
  const tz = Math.sin(yawRef)

  const proj = (p: T) => p.cx * tx + p.cz * tz
  const gAs = [...gA].sort((a, b) => proj(a) - proj(b))
  const gBs = [...gB].sort((a, b) => proj(a) - proj(b))
  const n = Math.min(gAs.length, gBs.length)

  const out = new Map<T, T>()
  for (const r of instances) out.set(r, { ...r })

  for (let i = 0; i < n; i++) {
    const curA = out.get(gAs[i])!
    const curB = out.get(gBs[i])!
    const dotT = (curB.cx - curA.cx) * tx + (curB.cz - curA.cz) * tz
    const half = dotT * 0.5
    curA.cx += half * tx; curA.cz += half * tz
    curB.cx -= half * tx; curB.cz -= half * tz
  }

  return instances.map((r) => out.get(r)!)
}

/**
 * 같은 yaw인 책장 4개(2×2)에서, 뒷면이 행별 같은 직선 위에 오도록
 * 중심을 법선 방향으로 미세 조정.
 */
export function microAlignShelfClusterBackEdgesFour<
  T extends { cx: number; cz: number; d: number; yaw: number },
>(shelves: T[]): T[] {
  if (shelves.length !== 4) return shelves.map((r) => ({ ...r }))
  const yaw = shelves[0].yaw
  const nx = Math.sin(yaw)
  const nz = Math.cos(yaw)

  type Item = { r: T; idx: number; nDot: number; backN: number }
  const items: Item[] = shelves.map((r, idx) => {
    const nDot = r.cx * nx + r.cz * nz
    return { r, idx, nDot, backN: nDot - r.d * 0.5 }
  })
  const sorted = [...items].sort((a, b) => a.nDot - b.nDot)

  const adjustRow = (row: Item[]): Map<number, T> => {
    const target = row.reduce((s, x) => s + x.backN, 0) / row.length
    const m = new Map<number, T>()
    for (const { r, idx } of row) {
      const delta = target - (r.cx * nx + r.cz * nz - r.d * 0.5)
      m.set(idx, { ...r, cx: r.cx + delta * nx, cz: r.cz + delta * nz })
    }
    return m
  }

  const out = new Map<number, T>()
  for (const [k, v] of adjustRow(sorted.slice(0, 2))) out.set(k, v)
  for (const [k, v] of adjustRow(sorted.slice(2, 4))) out.set(k, v)
  return shelves.map((_, i) => out.get(i)!)
}
