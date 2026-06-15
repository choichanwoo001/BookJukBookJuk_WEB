import type { Point2 } from '../data/floorPlan'
import { NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'
import type { WalkabilityContext } from './walkability'
import { isWalkablePoint } from './walkability'

export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function worldToGrid(
  x: number,
  z: number,
  bounds: WorldBounds,
  cellSize: number,
): { ix: number; iz: number } {
  const ix = Math.floor((x - bounds.minX) / cellSize)
  const iz = Math.floor((z - bounds.minZ) / cellSize)
  return { ix, iz }
}

export function gridToWorldCenter(
  ix: number,
  iz: number,
  bounds: WorldBounds,
  cellSize: number,
): Point2 {
  return [bounds.minX + (ix + 0.5) * cellSize, bounds.minZ + (iz + 0.5) * cellSize]
}

function isCellWalkable(
  ix: number,
  iz: number,
  nx: number,
  nz: number,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
): boolean {
  if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return false
  const [cx, cz] = gridToWorldCenter(ix, iz, bounds, cellSize)
  return isWalkablePoint(ctx, cx, cz)
}

/**
 * 월드 좌표에서 가장 가까운 걸을 수 있는 셀 중심을 반환 (맨해튼 링 BFS).
 */
export function findNearestWalkableWorldPoint(
  wx: number,
  wz: number,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
  maxRing: number,
): Point2 | null {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cellSize)
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize)
  if (nx < 1 || nz < 1) return null

  let ix = Math.floor((wx - bounds.minX) / cellSize)
  let iz = Math.floor((wz - bounds.minZ) / cellSize)
  ix = clamp(ix, 0, nx - 1)
  iz = clamp(iz, 0, nz - 1)

  if (isCellWalkable(ix, iz, nx, nz, ctx, bounds, cellSize)) {
    return gridToWorldCenter(ix, iz, bounds, cellSize)
  }

  for (let r = 1; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const tx = ix + dx
        const tz = iz + dz
        if (isCellWalkable(tx, tz, nx, nz, ctx, bounds, cellSize)) {
          return gridToWorldCenter(tx, tz, bounds, cellSize)
        }
      }
    }
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      for (const dx of [-r, r]) {
        const tx = ix + dx
        const tz = iz + dz
        if (isCellWalkable(tx, tz, nx, nz, ctx, bounds, cellSize)) {
          return gridToWorldCenter(tx, tz, bounds, cellSize)
        }
      }
    }
  }
  return null
}

type Cell = { ix: number; iz: number }

function heapPush(
  heap: { f: number; g: number; ix: number; iz: number }[],
  node: { f: number; g: number; ix: number; iz: number },
) {
  heap.push(node)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p].f <= heap[i].f) break
    ;[heap[p], heap[i]] = [heap[i], heap[p]]
    i = p
  }
}

function heapPop(heap: { f: number; g: number; ix: number; iz: number }[]) {
  if (heap.length === 0) return undefined
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let smallest = i
      if (l < heap.length && heap[l].f < heap[smallest].f) smallest = l
      if (r < heap.length && heap[r].f < heap[smallest].f) smallest = r
      if (smallest === i) break
      ;[heap[i], heap[smallest]] = [heap[smallest], heap[i]]
      i = smallest
    }
  }
  return top
}

function cellKey(ix: number, iz: number, nz: number) {
  return ix * nz + iz
}

/** 카드널 먼저 탐색 → 같은 비용에서 직선·꺾임 적은 경로를 선호하는 경향 */
const NEI = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]

/** 대각 이웃: 양쪽 카드널이 모두 걸을 수 있어야 모서리 끼기(벽 통과) 방지 */
function isDiagonalNeighborAllowed(
  ix: number,
  iz: number,
  dix: number,
  diz: number,
  nx: number,
  nz: number,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
): boolean {
  if (dix === 0 || diz === 0) return true
  return (
    isCellWalkable(ix + dix, iz, nx, nz, ctx, bounds, cellSize)
    && isCellWalkable(ix, iz + diz, nx, nz, ctx, bounds, cellSize)
  )
}

/** 두 점 사이 직선이 바닥 밖(unknown)·벽·장애물을 뚫지 않는지 샘플 검사 */
export function isSegmentWalkableWorld(
  a: Point2,
  b: Point2,
  ctx: WalkabilityContext,
  sampleStepM: number,
): boolean {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return isWalkablePoint(ctx, a[0], a[1])
  const n = Math.max(1, Math.ceil(len / sampleStepM))
  for (let s = 0; s <= n; s++) {
    const t = s / n
    const x = a[0] + dx * t
    const z = a[1] + dz * t
    if (!isWalkablePoint(ctx, x, z)) return false
  }
  return true
}

/**
 * 그리드 꺾임을 줄이기 위해, 앞에서 가장 먼 보행 가능한 직선으로 잘라 냄.
 */
function shortcutPathWorld(
  points: Point2[],
  ctx: WalkabilityContext,
  sampleStepM: number,
): Point2[] {
  if (points.length <= 2) return points
  const out: Point2[] = [points[0]]
  let i = 0
  while (i < points.length - 1) {
    let bestJ = i + 1
    for (let j = points.length - 1; j > i + 1; j--) {
      if (isSegmentWalkableWorld(points[i], points[j], ctx, sampleStepM)) {
        bestJ = j
        break
      }
    }
    out.push(points[bestJ])
    i = bestJ
  }
  return out
}

/**
 * A* on 8-neighbor grid. 시작/끝은 월드 좌표 — 내부에서 가장 가까운 걸을 수 있는 셀로 스냅.
 */
export function findPathWorldGrid(
  start: Point2,
  goal: Point2,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  cellSize: number,
): Point2[] | null {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cellSize)
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize)
  if (nx < 2 || nz < 2) return null

  const snapStart = findNearestWalkableWorldPoint(start[0], start[1], ctx, bounds, cellSize, 96)
  const snapGoal = findNearestWalkableWorldPoint(goal[0], goal[1], ctx, bounds, cellSize, 96)
  if (!snapStart || !snapGoal) return null

  const s = worldToGrid(snapStart[0], snapStart[1], bounds, cellSize)
  const g = worldToGrid(snapGoal[0], snapGoal[1], bounds, cellSize)
  const six = clamp(s.ix, 0, nx - 1)
  const siz = clamp(s.iz, 0, nz - 1)
  const gix = clamp(g.ix, 0, nx - 1)
  const giz = clamp(g.iz, 0, nz - 1)

  if (!isCellWalkable(six, siz, nx, nz, ctx, bounds, cellSize)) return null
  if (!isCellWalkable(gix, giz, nx, nz, ctx, bounds, cellSize)) return null

  const gx = bounds.minX + (gix + 0.5) * cellSize
  const gz = bounds.minZ + (giz + 0.5) * cellSize

  const open: { f: number; g: number; ix: number; iz: number }[] = []
  const gScore = new Map<number, number>()
  const came = new Map<number, Cell>()

  const h = (ix: number, iz: number) => {
    const dx = ix - gix
    const dz = iz - giz
    return Math.hypot(dx, dz) * cellSize
  }

  if (six === gix && siz === giz) {
    return [snapStart]
  }

  const startKey = cellKey(six, siz, nz)
  gScore.set(startKey, 0)
  heapPush(open, { f: h(six, siz), g: 0, ix: six, iz: siz })

  const maxSteps = nx * nz * 4
  let steps = 0

  while (open.length > 0 && steps < maxSteps) {
    steps++
    const cur = heapPop(open)
    if (!cur) break
    if (cur.ix === gix && cur.iz === giz) {
      const out: Point2[] = []
      let ck = cellKey(cur.ix, cur.iz, nz)
      let cx = cur.ix
      let cz = cur.iz
      out.push([gx, gz])
      while (came.has(ck)) {
        const prev = came.get(ck)!
        ck = cellKey(prev.ix, prev.iz, nz)
        cx = prev.ix
        cz = prev.iz
        out.push(gridToWorldCenter(cx, cz, bounds, cellSize))
      }
      out.reverse()
      return shortcutPathWorld(out, ctx, NAV_SEGMENT_SAMPLE_STEP_M)
    }

    for (let k = 0; k < NEI.length; k++) {
      const dix = NEI[k][0]
      const diz = NEI[k][1]
      const nix = cur.ix + dix
      const niz = cur.iz + diz
      if (nix < 0 || niz < 0 || nix >= nx || niz >= nz) continue
      if (!isCellWalkable(nix, niz, nx, nz, ctx, bounds, cellSize)) continue
      if (
        !isDiagonalNeighborAllowed(cur.ix, cur.iz, dix, diz, nx, nz, ctx, bounds, cellSize)
      ) {
        continue
      }
      if (
        !isSegmentWalkableWorld(
          gridToWorldCenter(cur.ix, cur.iz, bounds, cellSize),
          gridToWorldCenter(nix, niz, bounds, cellSize),
          ctx,
          Math.max(0.04, cellSize * 0.25),
        )
      ) {
        continue
      }

      const nk = cellKey(nix, niz, nz)
      const tentative = cur.g + COST[k] * cellSize
      const prevG = gScore.get(nk)
      if (prevG !== undefined && tentative >= prevG) continue

      gScore.set(nk, tentative)
      came.set(nk, { ix: cur.ix, iz: cur.iz })
      heapPush(open, { f: tentative + h(nix, niz), g: tentative, ix: nix, iz: niz })
    }
  }

  return null
}

/** 같은 직선 위의 중간 점 제거 (꺾임 수 감소) */
export function simplifyPathCollinear(points: Point2[]): Point2[] {
  if (points.length <= 2) return points
  const out: Point2[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]
    const b = points[i]
    const c = points[i + 1]
    const dx1 = b[0] - a[0]
    const dz1 = b[1] - a[1]
    const dx2 = c[0] - b[0]
    const dz2 = c[1] - b[1]
    const cross = dx1 * dz2 - dz1 * dx2
    if (Math.abs(cross) > 1e-6) out.push(b)
  }
  out.push(points[points.length - 1])
  return out
}

export function concatPaths(a: Point2[], b: Point2[], eps = 0.08): Point2[] {
  if (a.length === 0) return b.slice()
  if (b.length === 0) return a.slice()
  const la = a[a.length - 1]
  const fb = b[0]
  if (Math.hypot(la[0] - fb[0], la[1] - fb[1]) < eps) return [...a.slice(0, -1), ...b]
  return [...a, ...b]
}

export function segmentPathWorld(
  from: Point2,
  to: Point2,
  ctx: WalkabilityContext,
  bounds: WorldBounds,
  gridCellM: number,
  sampleStepM: number = NAV_SEGMENT_SAMPLE_STEP_M,
): Point2[] {
  const routed = findPathWorldGrid(from, to, ctx, bounds, gridCellM)
  if (routed && routed.length >= 2) return routed
  if (isSegmentWalkableWorld(from, to, ctx, sampleStepM)) {
    return [from, to]
  }
  return []
}
