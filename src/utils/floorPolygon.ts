import polyclip from 'polygon-clipping'
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping'

const intersection = polyclip.intersection
import { BufferGeometry, Path, Shape, ShapeGeometry } from 'three'
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

export function pointInPolygon2D(x: number, z: number, ring: [number, number][]): boolean {
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

function ensureClosedRing(pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return pts
  const a = pts[0]
  const b = pts[pts.length - 1]
  if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return pts
  return [...pts, [a[0], a[1]]]
}

function buildFloorMultiPolygon(outer: [number, number][], holes: [number, number][][]): MultiPolygon {
  const outerRing = ensureClosedRing(outer) as Ring
  if (holes.length === 0) return [[outerRing]]
  const holeRings = holes.map((h) => ensureClosedRing(h) as Ring)
  return [[outerRing, ...holeRings]]
}

function wallRectToRing(r: WallRect): Ring {
  const { cx, cz, w, d } = r
  const hw = w / 2
  const hd = d / 2
  return [
    [cx - hw, cz - hd],
    [cx + hw, cz - hd],
    [cx + hw, cz + hd],
    [cx - hw, cz + hd],
    [cx - hw, cz - hd],
  ]
}

function multipolygonToShapeGeometriesXZ(mp: MultiPolygon, yOffset: number): BufferGeometry[] {
  const geos: BufferGeometry[] = []
  for (const polygon of mp) {
    if (!polygon.length) continue
    const [outer, ...holeRings] = polygon
    if (outer.length < 3) continue
    const shape = new Shape()
    shape.moveTo(outer[0][0], outer[0][1])
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1])
    shape.closePath()
    for (const hole of holeRings) {
      if (hole.length < 3) continue
      const p = new Path()
      p.moveTo(hole[0][0], hole[0][1])
      for (let i = 1; i < hole.length; i++) p.lineTo(hole[i][0], hole[i][1])
      p.closePath()
      shape.holes.push(p)
    }
    const sg = new ShapeGeometry(shape)
    const pos = sg.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getY(i)
      pos.setXYZ(i, x, yOffset, z)
    }
    pos.needsUpdate = true
    sg.computeVertexNormals()
    geos.push(sg)
  }
  return geos
}

/**
 * Intersects each manual fill rect with valid floor (outer − holes) and builds merged-quality
 * floor patches (same ShapeGeometry path as the main floor), avoiding grid-cell stair-steps.
 */
export function buildFillGeometriesClippedToValidFloor(
  fillRects: WallRect[],
  outer: [number, number][],
  holes: [number, number][][],
  yOffset: number,
): BufferGeometry[] {
  if (fillRects.length === 0 || outer.length < 3) return []
  const floorMP = buildFloorMultiPolygon(outer, holes)
  const out: BufferGeometry[] = []
  for (const r of fillRects) {
    const rectMP: MultiPolygon = [[wallRectToRing(r)]]
    const clipped = intersection(floorMP, rectMP)
    out.push(...multipolygonToShapeGeometriesXZ(clipped, yOffset))
  }
  return out
}

function pointInPolygonWithHoles(x: number, z: number, poly: Polygon): boolean {
  if (!poly.length) return false
  const outer = poly[0] as [number, number][]
  const holePolys = poly.slice(1) as [number, number][][]
  return isPointInRingedPolygon(x, z, outer, holePolys)
}

function pointInMultiPolygon(x: number, z: number, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (pointInPolygonWithHoles(x, z, poly)) return true
  }
  return false
}

/**
 * 3D FloorPolygonMesh와 동일한 바닥 영역(외곽−홀 + 수동 rect 클립)에 (x,z)가 포함되는지.
 * 픽셀 루프 등에서 수동으로 intersection을 반복하지 않도록 테스트 함수를 반환합니다.
 */
export function createFloorPointInclusionTest(
  loops: [number, number][][],
  fillRects: WallRect[],
): (x: number, z: number) => boolean {
  if (loops.length === 0) return () => false
  const { outer, holes } = getFloorOuterAndHolePolygons(loops)
  if (outer.length < 3) return () => false
  const floorMP = buildFloorMultiPolygon(outer, holes)
  const manualClips = fillRects.map((r) => intersection(floorMP, [[wallRectToRing(r)]]))
  return (x: number, z: number) => {
    if (isPointInRingedPolygon(x, z, outer, holes)) return true
    return manualClips.some((mp) => pointInMultiPolygon(x, z, mp))
  }
}
