import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── YAML parameters (hardcoded from b2floor_edited.yaml) ──────────────
const RESOLUTION = 0.05
const ORIGIN_X = -53.4
const ORIGIN_Y = -19.1
const WALL_THRESHOLD = 50
const FREE_THRESHOLD = 220
const MIN_CLUSTER_SIZE = 50
const SIMPLIFY_TOLERANCE_M = 0.08
const AXIS_SNAP_DEG = 6
const RESAMPLE_SPACING_M = 0.1
const CORNER_RADIUS_M = 0.2
const MIN_LOOP_AREA_M2 = 0.01

// ── PGM P5 parser ─────────────────────────────────────────────────────
function parsePGM(filepath) {
  const buf = readFileSync(filepath)
  let offset = 0

  const readLine = () => {
    let line = ''
    while (offset < buf.length) {
      const ch = buf[offset++]
      if (ch === 10) break
      line += String.fromCharCode(ch)
    }
    return line.trim()
  }

  const magic = readLine()
  if (magic !== 'P5') throw new Error(`Expected P5, got ${magic}`)

  let width, height, maxval
  while (width === undefined || height === undefined || maxval === undefined) {
    const line = readLine()
    if (line.startsWith('#')) continue
    const tokens = line.split(/\s+/).filter(Boolean)
    for (const tok of tokens) {
      const n = parseInt(tok, 10)
      if (width === undefined) { width = n; continue }
      if (height === undefined) { height = n; continue }
      if (maxval === undefined) { maxval = n; continue }
    }
  }

  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    pixels[i] = buf[offset + i]
  }

  return { width, height, maxval, pixels }
}

// ── Binary classification ─────────────────────────────────────────────
function classify(pixels, width, height) {
  const WALL = 1
  const FREE = 2
  const grid = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] < WALL_THRESHOLD) grid[i] = WALL
    else if (pixels[i] > FREE_THRESHOLD) grid[i] = FREE
  }
  return grid
}

// ── Connected component labeling (4-connected) ───────────────────────
function labelComponents(grid, width, height, targetValue) {
  const labels = new Int32Array(width * height)
  let nextLabel = 1
  const componentSizes = new Map()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (grid[idx] !== targetValue || labels[idx] !== 0) continue

      const label = nextLabel++
      let size = 0
      const stack = [idx]
      while (stack.length > 0) {
        const ci = stack.pop()
        if (labels[ci] !== 0) continue
        if (grid[ci] !== targetValue) continue
        labels[ci] = label
        size++
        const cx = ci % width
        const cy = (ci - cx) / width
        if (cx > 0) stack.push(ci - 1)
        if (cx < width - 1) stack.push(ci + 1)
        if (cy > 0) stack.push(ci - width)
        if (cy < height - 1) stack.push(ci + width)
      }
      componentSizes.set(label, size)
    }
  }

  return { labels, componentSizes }
}

// ── Noise removal: remove small wall clusters ─────────────────────────
function removeSmallClusters(grid, width, height) {
  const WALL = 1
  const { labels, componentSizes } = labelComponents(grid, width, height, WALL)

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === WALL) {
      const label = labels[i]
      if (componentSizes.get(label) < MIN_CLUSTER_SIZE) {
        grid[i] = 0
      }
    }
  }
}

// ── Morphological closing (dilate then erode) ─────────────────────────
function dilate(src, width, height, val) {
  const dst = new Uint8Array(src)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (src[i] === val) continue
      if (
        src[i - 1] === val || src[i + 1] === val ||
        src[i - width] === val || src[i + width] === val
      ) {
        dst[i] = val
      }
    }
  }
  return dst
}

function erode(src, width, height, val) {
  const dst = new Uint8Array(src)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (src[i] !== val) continue
      if (
        src[i - 1] !== val || src[i + 1] !== val ||
        src[i - width] !== val || src[i + width] !== val
      ) {
        dst[i] = 0
      }
    }
  }
  return dst
}

function morphClose(grid, width, height) {
  const WALL = 1
  let g = dilate(grid, width, height, WALL)
  g = erode(g, width, height, WALL)
  return g
}

// ── Fill enclosed holes (non-wall spaces not connected to boundary) ───
function fillEnclosedHoles(grid, width, height) {
  const WALL = 1
  const FREE = 2
  const visited = new Uint8Array(width * height)
  const stack = []

  const pushIfOpen = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const idx = y * width + x
    if (visited[idx] || grid[idx] === WALL) return
    visited[idx] = 1
    stack.push(idx)
  }

  for (let x = 0; x < width; x++) {
    pushIfOpen(x, 0)
    pushIfOpen(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    pushIfOpen(0, y)
    pushIfOpen(width - 1, y)
  }

  while (stack.length > 0) {
    const idx = stack.pop()
    const x = idx % width
    const y = (idx - x) / width
    pushIfOpen(x - 1, y)
    pushIfOpen(x + 1, y)
    pushIfOpen(x, y - 1)
    pushIfOpen(x, y + 1)
  }

  let filled = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL && !visited[i]) {
      if (grid[i] !== FREE) filled++
      grid[i] = FREE
    }
  }
  return filled
}

// ── Greedy meshing: merge pixels of a given value into rectangles ─────
function greedyMesh(grid, width, height, targetValue) {
  const used = new Uint8Array(width * height)
  const rects = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (grid[idx] !== targetValue || used[idx]) continue

      let maxW = 0
      while (x + maxW < width && grid[y * width + x + maxW] === targetValue && !used[y * width + x + maxW]) {
        maxW++
      }

      let maxH = 1
      outer:
      for (let dy = 1; y + dy < height; dy++) {
        for (let dx = 0; dx < maxW; dx++) {
          const ni = (y + dy) * width + (x + dx)
          if (grid[ni] !== targetValue || used[ni]) break outer
        }
        maxH++
      }

      for (let dy = 0; dy < maxH; dy++) {
        for (let dx = 0; dx < maxW; dx++) {
          used[(y + dy) * width + (x + dx)] = 1
        }
      }

      rects.push({ x, y, w: maxW, h: maxH })
    }
  }

  return rects
}

// ── Pixel to world coordinate conversion ──────────────────────────────
function pxToWorld(col, row, height) {
  const wx = ORIGIN_X + col * RESOLUTION
  const wz = ORIGIN_Y + (height - 1 - row) * RESOLUTION
  return [wx, wz]
}

// ── Boundary extraction from free-space mask ───────────────────────────
function extractFreeBoundaryLoops(grid, width, height) {
  const FREE = 2
  const segments = []
  const inside = (x, y) => grid[y * width + x] === FREE
  const edgePoint = (x, y, edgeId) => {
    if (edgeId === 0) return [x + 0.5, y]
    if (edgeId === 1) return [x + 1, y + 0.5]
    if (edgeId === 2) return [x + 0.5, y + 1]
    return [x, y + 0.5]
  }
  const addSegment = (x, y, e1, e2) => {
    const a = edgePoint(x, y, e1)
    const b = edgePoint(x, y, e2)
    segments.push({ a, b })
  }

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = inside(x, y) ? 1 : 0
      const b = inside(x + 1, y) ? 1 : 0
      const c = inside(x + 1, y + 1) ? 1 : 0
      const d = inside(x, y + 1) ? 1 : 0
      const state = (a << 3) | (b << 2) | (c << 1) | d

      switch (state) {
        case 0:
        case 15:
          break
        case 1: addSegment(x, y, 3, 2); break
        case 2: addSegment(x, y, 2, 1); break
        case 3: addSegment(x, y, 3, 1); break
        case 4: addSegment(x, y, 0, 1); break
        case 5: addSegment(x, y, 0, 3); addSegment(x, y, 2, 1); break
        case 6: addSegment(x, y, 0, 2); break
        case 7: addSegment(x, y, 0, 3); break
        case 8: addSegment(x, y, 0, 3); break
        case 9: addSegment(x, y, 0, 2); break
        case 10: addSegment(x, y, 0, 1); addSegment(x, y, 2, 3); break
        case 11: addSegment(x, y, 0, 1); break
        case 12: addSegment(x, y, 3, 1); break
        case 13: addSegment(x, y, 2, 1); break
        case 14: addSegment(x, y, 3, 2); break
      }
    }
  }

  const pKey = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`
  const adjacency = new Map()
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const ak = pKey(s.a)
    const bk = pKey(s.b)
    if (!adjacency.has(ak)) adjacency.set(ak, [])
    if (!adjacency.has(bk)) adjacency.set(bk, [])
    adjacency.get(ak).push(i)
    adjacency.get(bk).push(i)
  }

  const used = new Uint8Array(segments.length)
  const loops = []
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const first = segments[i]
    const loop = [[first.a[0], first.a[1]], [first.b[0], first.b[1]]]
    let currentKey = pKey(first.b)
    const startKey = pKey(first.a)
    let guard = 0

    while (guard++ < segments.length + 20) {
      if (currentKey === startKey) break
      const connected = adjacency.get(currentKey) || []
      let nextIndex = -1
      for (const ci of connected) {
        if (!used[ci]) {
          nextIndex = ci
          break
        }
      }
      if (nextIndex < 0) break
      used[nextIndex] = 1
      const seg = segments[nextIndex]
      const last = loop[loop.length - 1]
      const aMatch = Math.abs(seg.a[0] - last[0]) < 1e-4 && Math.abs(seg.a[1] - last[1]) < 1e-4
      const nextPoint = aMatch ? seg.b : seg.a
      loop.push([nextPoint[0], nextPoint[1]])
      currentKey = pKey(nextPoint)
    }

    if (loop.length >= 4 && currentKey === startKey) {
      loop.pop()
      loops.push(loop)
    }
  }

  return loops
}

function distToSegment(p, a, b) {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const wx = p[0] - a[0]
  const wz = p[1] - a[1]
  const len2 = vx * vx + vz * vz
  if (len2 <= 1e-10) return Math.hypot(wx, wz)
  let t = (wx * vx + wz * vz) / len2
  t = Math.max(0, Math.min(1, t))
  const px = a[0] + vx * t
  const pz = a[1] + vz * t
  return Math.hypot(p[0] - px, p[1] - pz)
}

// Ramer-Douglas-Peucker simplification for an open polyline segment
function rdpOpen(points, tolerance) {
  if (points.length <= 2) return points
  let maxDist = 0
  let maxIdx = 1
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > tolerance) {
    const left = rdpOpen(points.slice(0, maxIdx + 1), tolerance)
    const right = rdpOpen(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

// Smart RDP that preserves corners turning more than cornerAngleDeg
function smartSimplify(points, lowTol, highTol, cornerAngleDeg) {
  // Pass 1: Remove micro-noise (grid stairs)
  const base = dedupeLoop(simplifyLoop(points, lowTol));
  if (base.length <= 4) return simplifyLoop(base, highTol);

  const radThresh = (Math.PI / 180) * cornerAngleDeg;
  const corners = new Set([0]);

  // Pass 2: Identify structural corners
  for (let i = 0; i < base.length; i++) {
    const prev = base[(i - 1 + base.length) % base.length];
    const curr = base[i];
    const next = base[(i + 1) % base.length];

    const v1x = curr[0] - prev[0];
    const v1z = curr[1] - prev[1];
    const l1 = Math.hypot(v1x, v1z);
    
    const v2x = next[0] - curr[0];
    const v2z = next[1] - curr[1];
    const l2 = Math.hypot(v2x, v2z);

    if (l1 < 1e-5 || l2 < 1e-5) {
      corners.add(i);
      continue;
    }

    const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (angle > radThresh) {
      corners.add(i);
    }
  }

  if (corners.size < 2) {
    corners.add(Math.floor(base.length / 2));
  }

  const cornerIndices = Array.from(corners).sort((a,b) => a - b);
  
  // Pass 3: Process segments between corners
  const result = [];
  for (let c = 0; c < cornerIndices.length; c++) {
    const startIdx = cornerIndices[c];
    const endIdx = cornerIndices[(c + 1) % cornerIndices.length];

    const segment = [];
    if (endIdx > startIdx) {
      for (let i = startIdx; i <= endIdx; i++) segment.push(base[i]);
    } else {
      for (let i = startIdx; i < base.length; i++) segment.push(base[i]);
      for (let i = 0; i <= endIdx; i++) segment.push(base[i]);
    }

    const smoothed = rdpOpen(segment, highTol);
    
    for (let i = 0; i < smoothed.length - 1; i++) {
      result.push(smoothed[i]);
    }
  }
  
  return dedupeLoop(result);
}

// RDP simplification for a closed loop: split at the two farthest points,
// simplify each half, then recombine. This correctly preserves real wall corners
// while removing pixel-level staircase steps.
function simplifyLoop(points, tolerance) {
  if (points.length <= 3) return points
  // Find the pair of points that are farthest apart — use them as anchors
  let maxDist = 0
  let idx1 = 0
  let idx2 = Math.floor(points.length / 2)
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1])
      if (d > maxDist) { maxDist = d; idx1 = i; idx2 = j }
    }
  }
  // Split loop into two halves at those anchor points
  const half1 = points.slice(idx1, idx2 + 1)
  const half2 = [...points.slice(idx2), ...points.slice(0, idx1 + 1)]
  const s1 = rdpOpen(half1, tolerance)
  const s2 = rdpOpen(half2, tolerance)
  // Combine, avoiding duplicate anchor points at the seam
  const combined = [...s1.slice(0, -1), ...s2.slice(0, -1)]
  return combined.length >= 3 ? combined : points
}

function snapLoopToAxis(points, snapDeg) {
  if (points.length <= 2) return points
  const rad = (snapDeg * Math.PI) / 180
  const tanT = Math.tan(rad)
  const result = points.map(p => [p[0], p[1]])
  for (let i = 0; i < result.length; i++) {
    const cur = result[i]
    const next = result[(i + 1) % result.length]
    const dx = next[0] - cur[0]
    const dz = next[1] - cur[1]
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) continue
    if (Math.abs(dz) <= Math.abs(dx) * tanT) {
      next[1] = cur[1]
    } else if (Math.abs(dx) <= Math.abs(dz) * tanT) {
      next[0] = cur[0]
    }
  }
  return result
}

function loopSignedArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area * 0.5
}

function loopPerimeter(points) {
  let len = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    len += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return len
}

function loopBoundsArea(points) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ)
}

function gridLoopToWorld(loop, imgHeight, offsetX, offsetZ) {
  const world = loop.map(([vx, vy]) => {
    const [x, z] = pxToWorld(vx, vy, imgHeight)
    return [
      Math.round((x - offsetX) * 1000) / 1000,
      Math.round((z - offsetZ) * 1000) / 1000,
    ]
  })
  if (loopSignedArea(world) < 0) world.reverse()
  return world
}

function roundCorners(loop, radius) {
  if (loop.length < 4 || radius <= 0) return loop
  const rounded = []
  const curveSamples = 4

  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length]
    const curr = loop[i]
    const next = loop[(i + 1) % loop.length]
    const v1x = curr[0] - prev[0]
    const v1z = curr[1] - prev[1]
    const v2x = next[0] - curr[0]
    const v2z = next[1] - curr[1]
    const l1 = Math.hypot(v1x, v1z)
    const l2 = Math.hypot(v2x, v2z)
    if (l1 < 1e-6 || l2 < 1e-6) {
      rounded.push([curr[0], curr[1]])
      continue
    }

    const u1x = v1x / l1
    const u1z = v1z / l1
    const u2x = v2x / l2
    const u2z = v2z / l2
    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z))
    const angle = Math.acos(dot)
    const isNearlyStraight = angle < (AXIS_SNAP_DEG * Math.PI) / 180 || Math.PI - angle < 0.05
    if (isNearlyStraight) {
      rounded.push([curr[0], curr[1]])
      continue
    }

    const cut = Math.min(radius, l1 * 0.45, l2 * 0.45)
    const start = [curr[0] - u1x * cut, curr[1] - u1z * cut]
    const end = [curr[0] + u2x * cut, curr[1] + u2z * cut]
    rounded.push(start)
    for (let s = 1; s < curveSamples; s++) {
      const t = s / curveSamples
      const mt = 1 - t
      rounded.push([
        mt * mt * start[0] + 2 * mt * t * curr[0] + t * t * end[0],
        mt * mt * start[1] + 2 * mt * t * curr[1] + t * t * end[1],
      ])
    }
    rounded.push(end)
  }
  return rounded
}

function dedupeLoop(loop) {
  if (loop.length === 0) return loop
  const result = []
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i]
    const prev = result[result.length - 1]
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) {
      result.push([p[0], p[1]])
    }
  }
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) result.pop()
  }
  return result
}

function resampleLoop(loop, spacing) {
  if (loop.length < 3 || spacing <= 0) return loop
  const sampled = []
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / spacing))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      sampled.push([a[0] + dx * t, a[1] + dz * t])
    }
  }
  return sampled
}

// ── Convert pixel rects to world rects with centering ─────────────────
function pixelRectsToWorld(rawRects, imgHeight, offsetX, offsetZ) {
  return rawRects.map(r => {
    const [x1, z1] = pxToWorld(r.x, r.y, imgHeight)
    const [x2, z2] = pxToWorld(r.x + r.w, r.y + r.h, imgHeight)
    const cx = (x1 + x2) / 2 - offsetX
    const cz = (z1 + z2) / 2 - offsetZ
    const w = Math.abs(x2 - x1)
    const d = Math.abs(z2 - z1)
    return {
      cx: Math.round(cx * 1000) / 1000,
      cz: Math.round(cz * 1000) / 1000,
      w: Math.round(w * 1000) / 1000,
      d: Math.round(d * 1000) / 1000,
    }
  })
}

// ── Main pipeline ─────────────────────────────────────────────────────
function main() {
  console.log('Reading PGM file...')
  const pgmPath = resolve(ROOT, 'b2floor_edited.pgm')
  const { width, height, pixels } = parsePGM(pgmPath)
  console.log(`  Dimensions: ${width}x${height}`)

  console.log('Classifying pixels...')
  let grid = classify(pixels, width, height)

  const MANUAL_NOISE_ZONES = [
    { cx: -3.14, cz: -7.61, radius: 0.4 },
    { cx: -9.84, cz: -14.31, radius: 0.4 },
    { cx: -10.18, cz: -14.30, radius: 0.4 },
    { cx: -10.76, cz: -13.90, radius: 0.4 },
    { cx: -12.07, cz: -13.64, radius: 0.4 },
    { cx: -12.23, cz: -13.65, radius: 0.4 },
    { cx: -12.39, cz: -13.60, radius: 0.4 },
    { cx: -13.09, cz: -13.32, radius: 0.4 },
    { cx: -12.95, cz: -12.71, radius: 0.4 },
    { cx: -13.05, cz: -12.55, radius: 0.4 },
    { cx: -12.84, cz: -12.03, radius: 0.4 },
    { cx: -12.96, cz: -12.12, radius: 0.4 },
    { cx: -12.42, cz: -10.68, radius: 0.4 },
    { cx: -12.50, cz: -10.97, radius: 0.4 },
    { cx: -11.59, cz: -8.40, radius: 0.4 },
    { cx: -15.79, cz: 0.79, radius: 0.4 },
    { cx: -15.50, cz: 1.69, radius: 0.4 },
    { cx: -15.85, cz: 1.82, radius: 0.4 },
    { cx: -15.26, cz: 3.62, radius: 0.4 },
    { cx: 0.71, cz: 12.21, radius: 0.4 },
    { cx: 0.64, cz: 12.54, radius: 0.4 },
    { cx: 1.43, cz: -2.16, radius: 0.4 },
    { cx: 1.41, cz: -2.52, radius: 0.4 },
    { cx: 1.74, cz: -2.67, radius: 0.4 },
    { cx: 2.22, cz: -2.97, radius: 0.4 },
    { cx: 35.52, cz: -3.66, radius: 0.4 },
    { cx: 36.17, cz: -3.36, radius: 0.4 },
    { cx: 0.21, cz: 12.22, radius: 0.4 }
  ]

  const EXPECTED_OFFSET_X = -26.00
  const EXPECTED_OFFSET_Z = 3.26

  console.log('Applying manual noise removal...')
  let manualRemoved = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] === 1) { // WALL
        const [wx, wz] = pxToWorld(x, y, height)
        const finalX = wx - EXPECTED_OFFSET_X
        const finalZ = wz - EXPECTED_OFFSET_Z
        for (const zone of MANUAL_NOISE_ZONES) {
          const dx = finalX - zone.cx
          const dz = finalZ - zone.cz
          if (dx * dx + dz * dz <= zone.radius * zone.radius) {
            grid[y * width + x] = 2 // FREE
            manualRemoved++
            break
          }
        }
      }
    }
  }
  console.log(`  Manually removed ${manualRemoved} wall pixels`)

  const countVal = (g, v) => g.reduce((n, c) => n + (c === v ? 1 : 0), 0)
  console.log(`  Walls: ${countVal(grid, 1)}, Free: ${countVal(grid, 2)}`)

  console.log('Removing small noise clusters...')
  removeSmallClusters(grid, width, height)
  console.log(`  Walls after cleanup: ${countVal(grid, 1)}`)

  console.log('Morphological closing...')
  grid = morphClose(grid, width, height)
  console.log(`  Walls after closing: ${countVal(grid, 1)}`)
  // Closing can reintroduce tiny isolated wall speckles; clean once more.
  removeSmallClusters(grid, width, height)
  console.log(`  Walls after post-closing cleanup: ${countVal(grid, 1)}`)

  console.log('Filling enclosed holes...')
  const filledHoles = fillEnclosedHoles(grid, width, height)
  console.log(`  Filled enclosed cells: ${filledHoles}`)

  // Keep only the largest free component (building interior)
  console.log('Filtering to largest free component...')
  const { labels: freeLabels, componentSizes: freeSizes } = labelComponents(grid, width, height, 2)
  let largestFreeLabel = 0, largestFreeSize = 0
  for (const [label, size] of freeSizes) {
    if (size > largestFreeSize) { largestFreeSize = size; largestFreeLabel = label }
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 2 && freeLabels[i] !== largestFreeLabel) {
      grid[i] = 0
    }
  }
  console.log(`  Largest free component: ${largestFreeSize} pixels, removed ${countVal(grid, 0) - (width * height - countVal(grid, 1) - largestFreeSize)} small free clusters`)

  console.log('Greedy meshing wall pixels...')
  const rawWallRects = greedyMesh(grid, width, height, 1)
  console.log(`  Wall rectangles: ${rawWallRects.length}`)

  console.log('Greedy meshing floor pixels...')
  const rawFloorRects = greedyMesh(grid, width, height, 2)
  console.log(`  Floor rectangles: ${rawFloorRects.length}`)

  // Compute center offset from floor rects (more representative of interior)
  let sumX = 0, sumZ = 0, totalArea = 0
  for (const r of rawFloorRects) {
    const [x1, z1] = pxToWorld(r.x, r.y, height)
    const [x2, z2] = pxToWorld(r.x + r.w, r.y + r.h, height)
    const area = Math.abs(x2 - x1) * Math.abs(z2 - z1)
    sumX += ((x1 + x2) / 2) * area
    sumZ += ((z1 + z2) / 2) * area
    totalArea += area
  }
  const offsetX = totalArea > 0 ? sumX / totalArea : 0
  const offsetZ = totalArea > 0 ? sumZ / totalArea : 0
  console.log(`Center offset: (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)

  const wallRects = pixelRectsToWorld(rawWallRects, height, offsetX, offsetZ)
  const floorRects = pixelRectsToWorld(rawFloorRects, height, offsetX, offsetZ)
  const rawLoops = extractFreeBoundaryLoops(grid, width, height)
  console.log(`Boundary loops: ${rawLoops.length}`)
  const wallPolylines = rawLoops
    .map(loop => {
      const worldLoop = gridLoopToWorld(loop, height, offsetX, offsetZ)
      const smoothed = smartSimplify(worldLoop, 0.05, 0.30, 40)
      const snapped = snapLoopToAxis(smoothed, AXIS_SNAP_DEG)
      const rounded = dedupeLoop(roundCorners(dedupeLoop(snapped), CORNER_RADIUS_M))
      const base = rounded.length >= 3 ? rounded : dedupeLoop(snapped)
      const resampled = dedupeLoop(resampleLoop(base, RESAMPLE_SPACING_M))
      return dedupeLoop(simplifyLoop(resampled, 0.05))
    })
    .filter(loop => loop.length >= 3)
  console.log(`Smoothed wall polylines: ${wallPolylines.length}`)

  // Compute map extent
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const r of [...wallRects, ...floorRects]) {
    minX = Math.min(minX, r.cx - r.w / 2)
    maxX = Math.max(maxX, r.cx + r.w / 2)
    minZ = Math.min(minZ, r.cz - r.d / 2)
    maxZ = Math.max(maxZ, r.cz + r.d / 2)
  }
  const mapWidth = Math.round((maxX - minX) * 100) / 100
  const mapDepth = Math.round((maxZ - minZ) * 100) / 100

  console.log(`Map extent: ${mapWidth}m x ${mapDepth}m`)

  // Generate TypeScript output
  const ts = `// Auto-generated from b2floor_edited.pgm — do not edit manually.
// Run: node scripts/processMap.mjs

export type WallRect = { cx: number; cz: number; w: number; d: number }
export type Point2 = [number, number]

export const MAP_RESOLUTION = ${RESOLUTION}
export const mapWidth = ${mapWidth}
export const mapDepth = ${mapDepth}

export const wallRects: WallRect[] = ${JSON.stringify(wallRects)}
export const wallPolylines: Point2[][] = ${JSON.stringify(wallPolylines)}

export const floorRects: WallRect[] = ${JSON.stringify(floorRects)}
`

  const outPath = resolve(ROOT, 'src', 'data', 'mapData.ts')
  writeFileSync(outPath, ts, 'utf-8')
  console.log(`\nWrote ${outPath}`)
  console.log(`  wallRects: ${wallRects.length}`)
  console.log(`  floorRects: ${floorRects.length}`)
}

main()
