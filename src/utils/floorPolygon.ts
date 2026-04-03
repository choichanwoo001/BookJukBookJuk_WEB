import type { WallRect } from '../data/floorPlan'

export function signedArea2D(pts: [number, number][]) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area * 0.5
}

const MIN_FLOOR_VOID_LOOP_AREA_M2 = 0.35

/** Outer boundary + void holes (same winding rules as FloorPolygonMesh Shape). */
export function getFloorOuterAndHolePolygons(
  loops: [number, number][][],
): { outer: [number, number][]; holes: [number, number][][] } {
  if (loops.length === 0) return { outer: [], holes: [] }
  let outerIdx = 0
  let outerAbsArea = 0
  for (let i = 0; i < loops.length; i++) {
    const a = Math.abs(signedArea2D(loops[i]))
    if (a > outerAbsArea) {
      outerAbsArea = a
      outerIdx = i
    }
  }
  const outerPts = loops[outerIdx]
  const outerSign = Math.sign(signedArea2D(outerPts)) || 1
  const holes: [number, number][][] = []
  for (let i = 0; i < loops.length; i++) {
    if (i === outerIdx) continue
    const loop = loops[i]
    if (loop.length < 3) continue
    if (Math.abs(signedArea2D(loop)) < MIN_FLOOR_VOID_LOOP_AREA_M2) continue
    let pts = loop
    if (Math.sign(signedArea2D(loop)) === outerSign) pts = [...loop].reverse()
    holes.push(pts)
  }
  return { outer: outerPts, holes }
}

function pointInPolygon2D(x: number, z: number, ring: [number, number][]): boolean {
  if (ring.length < 3) return false
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0]
    const zi = ring[i][1]
    const xj = ring[j][0]
    const zj = ring[j][1]
    const intersect =
      (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function isPointInRingedPolygon(
  x: number,
  z: number,
  outer: [number, number][],
  holes: [number, number][][],
): boolean {
  if (!pointInPolygon2D(x, z, outer)) return false
  for (const h of holes) {
    if (pointInPolygon2D(x, z, h)) return false
  }
  return true
}

/** Axis-aligned fill rects split into cells; only cells whose center lies on valid floor (outer − holes). */
export function getFillRectsClippedToValidFloor(
  fillRects: WallRect[],
  outer: [number, number][],
  holes: [number, number][][],
  targetCellM: number,
): { cx: number; cz: number; w: number; d: number }[] {
  const out: { cx: number; cz: number; w: number; d: number }[] = []
  for (const r of fillRects) {
    const halfW = r.w / 2
    const halfD = r.d / 2
    const x0 = r.cx - halfW
    const x1 = r.cx + halfW
    const z0 = r.cz - halfD
    const z1 = r.cz + halfD
    const width = x1 - x0
    const depth = z1 - z0
    const ncx = Math.max(1, Math.ceil(width / targetCellM))
    const ncz = Math.max(1, Math.ceil(depth / targetCellM))
    const cellW = width / ncx
    const cellD = depth / ncz
    for (let ix = 0; ix < ncx; ix++) {
      for (let iz = 0; iz < ncz; iz++) {
        const cx = x0 + (ix + 0.5) * cellW
        const cz = z0 + (iz + 0.5) * cellD
        if (isPointInRingedPolygon(cx, cz, outer, holes)) {
          out.push({ cx, cz, w: cellW, d: cellD })
        }
      }
    }
  }
  return out
}
