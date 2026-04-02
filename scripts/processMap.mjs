import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const WALL = 1
const FREE = 2
const UNKNOWN = 0

const DEFAULT_IMAGE = 'KakaoTalk_20260329_205358459.pgm'
const YAML_PATH = resolve(ROOT, 'b2floor_edited.yaml')

const MIN_CLUSTER_SIZE = 28
const AXIS_SNAP_DEG = 8
const CENTER_LOOP_SIMPLIFY_M = 0.15
const RENDER_LOOP_SIMPLIFY_M = 0.25
const HOLE_LOOP_SIMPLIFY_M = 0.08
const CENTER_LOOP_MIN_SEGMENT_M = 0.12
const RENDER_LOOP_MIN_SEGMENT_M = 0.2
const HOLE_LOOP_MIN_SEGMENT_M = 0.08

let RESOLUTION = 0.05
let ORIGIN_X = -53.4
let ORIGIN_Y = -19.1

function parseSimpleYaml(path) {
  const text = readFileSync(path, 'utf-8')
  const result = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    result[key] = value
  }
  return result
}

function parseYamlMapConfig(path) {
  const data = parseSimpleYaml(path)
  const imageName = (data.image || '').trim() || DEFAULT_IMAGE
  const mode = String(data.mode || 'trinary').trim().toLowerCase()
  const negate = Number(data.negate ?? 0)
  const resolution = Number(data.resolution ?? 0.05)
  const occupiedThresh = Number(data.occupied_thresh ?? 0.65)
  const freeThresh = Number(data.free_thresh ?? 0.25)
  const originMatch = String(data.origin ?? '[-53.4, -19.1, 0]').match(/\[([^\]]+)\]/)
  const originValues = originMatch
    ? originMatch[1].split(',').map(v => Number(v.trim()))
    : [-53.4, -19.1, 0]
  return {
    imageName,
    mode,
    negate,
    resolution,
    occupiedThresh,
    freeThresh,
    originX: originValues[0] ?? -53.4,
    originY: originValues[1] ?? -19.1,
  }
}

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
  for (let i = 0; i < width * height; i++) pixels[i] = buf[offset + i]
  return { width, height, maxval, pixels }
}

async function parseRasterImage(filepath, negate = 0) {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(filepath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  if (negate === 1) {
    for (let i = 0; i < pixels.length; i++) pixels[i] = 255 - pixels[i]
  }
  const histogram = new Uint32Array(256)
  for (let i = 0; i < pixels.length; i++) histogram[pixels[i]]++
  let backgroundValue = 0
  let bestCount = -1
  for (let i = 0; i < histogram.length; i++) {
    if (histogram[i] > bestCount) {
      bestCount = histogram[i]
      backgroundValue = i
    }
  }
  return {
    width: info.width,
    height: info.height,
    maxval: 255,
    pixels,
    backgroundValue,
  }
}

function classifyRaster(pixels, wallThreshold, freeThreshold, backgroundValue, backgroundTolerance = 3) {
  const grid = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i++) {
    const pv = pixels[i]
    if (pv <= wallThreshold) {
      grid[i] = WALL
      continue
    }
    if (pv >= freeThreshold) {
      grid[i] = FREE
      continue
    }
    if (Math.abs(pv - backgroundValue) <= backgroundTolerance) {
      grid[i] = UNKNOWN
      continue
    }
    grid[i] = UNKNOWN
  }
  return grid
}

function thresholdsFromYaml(occupiedThresh, freeThresh) {
  const wallThreshold = Math.max(0, Math.min(254, Math.floor((1 - occupiedThresh) * 255)))
  const freeThreshold = Math.max(1, Math.min(255, Math.ceil((1 - freeThresh) * 255)))
  return { wallThreshold, freeThreshold }
}

function classify(pixels, wallThreshold, freeThreshold, mode) {
  const grid = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i++) {
    const pv = pixels[i]
    if (pv <= wallThreshold) {
      grid[i] = WALL
      continue
    }
    if (mode === 'trinary') {
      // In ROS trinary maps, unknown is typically around ~205.
      // Treat only near-white cells as free so unknown does not become floor.
      grid[i] = pv >= 250 ? FREE : UNKNOWN
      continue
    }
    if (pv >= freeThreshold) grid[i] = FREE
  }
  return grid
}

function extractComponents(grid, width, height, targetValue) {
  const labels = new Int32Array(width * height)
  const components = []
  let nextLabel = 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (grid[idx] !== targetValue || labels[idx] !== 0) continue
      const label = nextLabel++
      const stack = [idx]
      const indices = []
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      while (stack.length) {
        const ci = stack.pop()
        if (labels[ci] !== 0 || grid[ci] !== targetValue) continue
        labels[ci] = label
        indices.push(ci)
        const cx = ci % width
        const cy = (ci - cx) / width
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        if (cx > 0) stack.push(ci - 1)
        if (cx < width - 1) stack.push(ci + 1)
        if (cy > 0) stack.push(ci - width)
        if (cy < height - 1) stack.push(ci + width)
      }
      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      components.push({
        label,
        size: indices.length,
        indices,
        minX,
        maxX,
        minY,
        maxY,
        bboxW: bw,
        bboxH: bh,
        fillRatio: indices.length / Math.max(1, bw * bh),
        aspect: bw > bh ? bw / Math.max(1, bh) : bh / Math.max(1, bw),
        touchesBoundary: minX === 0 || maxX === width - 1 || minY === 0 || maxY === height - 1,
      })
    }
  }
  return { labels, components }
}

function pxToWorld(col, row, height) {
  const wx = ORIGIN_X + col * RESOLUTION
  const wz = ORIGIN_Y + (height - 1 - row) * RESOLUTION
  return [wx, wz]
}

function isLikelyPillar(component) {
  const widthM = component.bboxW * RESOLUTION
  const depthM = component.bboxH * RESOLUTION
  const regularPillar = (
    component.size >= 18 &&
    component.size <= 420 &&
    widthM >= 0.25 &&
    widthM <= 2.2 &&
    depthM >= 0.25 &&
    depthM <= 2.2 &&
    component.aspect <= 2.4 &&
    component.fillRatio >= 0.35
  )
  const tinyPillar = (
    component.size >= 1 &&
    component.size <= 90 &&
    widthM >= 0.03 &&
    widthM <= 0.7 &&
    depthM >= 0.03 &&
    depthM <= 0.7 &&
    component.aspect <= 2.0 &&
    component.fillRatio >= 0.1
  )
  return regularPillar || tinyPillar
}

function removeWallNoisePreservingPillars(grid, width, height) {
  const { components } = extractComponents(grid, width, height, WALL)
  let removed = 0
  let pillarLike = 0
  for (const c of components) {
    const keep = c.size >= MIN_CLUSTER_SIZE || isLikelyPillar(c)
    if (isLikelyPillar(c)) pillarLike++
    if (keep) continue
    for (const idx of c.indices) {
      grid[idx] = 0
      removed++
    }
  }
  return { removed, pillarLike }
}

function dilate(src, width, height, val) {
  const dst = new Uint8Array(src)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (src[i] === val) continue
      if (src[i - 1] === val || src[i + 1] === val || src[i - width] === val || src[i + width] === val) dst[i] = val
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
      if (src[i - 1] !== val || src[i + 1] !== val || src[i - width] !== val || src[i + width] !== val) dst[i] = 0
    }
  }
  return dst
}

function morphClose(grid, width, height) {
  return erode(dilate(grid, width, height, WALL), width, height, WALL)
}

function resolveEnclosedRegions(grid, width, height) {
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
  const enclosedComponents = []
  const enclosedLabels = new Int32Array(width * height)
  let nextLabel = 1
  for (let i = 0; i < grid.length; i++) {
    if (visited[i] || grid[i] === WALL || enclosedLabels[i] !== 0) continue
    const label = nextLabel++
    const localStack = [i]
    let size = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (localStack.length > 0) {
      const idx = localStack.pop()
      if (visited[idx] || grid[idx] === WALL || enclosedLabels[idx] !== 0) continue
      enclosedLabels[idx] = label
      size++
      const x = idx % width
      const y = (idx - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0) localStack.push(idx - 1)
      if (x < width - 1) localStack.push(idx + 1)
      if (y > 0) localStack.push(idx - width)
      if (y < height - 1) localStack.push(idx + width)
    }
    enclosedComponents.push({
      label,
      size,
      bboxW: maxX - minX + 1,
      bboxH: maxY - minY + 1,
    })
  }
  let largest = null
  for (const c of enclosedComponents) {
    if (!largest || c.size > largest.size) largest = c
  }
  const largeAreaCutoff = largest ? Math.max(300, Math.floor(largest.size * 0.22)) : 300
  const structureMaxSidePx = Math.max(10, Math.round(2.8 / RESOLUTION))
  let freeAssigned = 0
  let wallAssigned = 0
  for (let i = 0; i < grid.length; i++) {
    const label = enclosedLabels[i]
    if (label === 0) continue
    const c = enclosedComponents[label - 1]
    const likelyStructure = (
      c.size < largeAreaCutoff &&
      c.bboxW <= structureMaxSidePx &&
      c.bboxH <= structureMaxSidePx
    )
    if (likelyStructure) {
      if (grid[i] !== WALL) wallAssigned++
      grid[i] = WALL
    } else {
      if (grid[i] !== FREE) freeAssigned++
      grid[i] = FREE
    }
  }
  return {
    enclosedCount: enclosedComponents.length,
    freeAssigned,
    wallAssigned,
    largestEnclosedSize: largest?.size ?? 0,
  }
}

function keepSignificantFreeComponents(grid, width, height) {
  const { labels, components } = extractComponents(grid, width, height, FREE)
  const interiorComponents = components.filter(c => !c.touchesBoundary)
  const searchSpace = interiorComponents.length > 0 ? interiorComponents : components
  let largestSize = 0
  for (const c of searchSpace) {
    if (c.size > largestSize) largestSize = c.size
  }
  const minKeepSize = Math.floor(largestSize * 0.05)
  const keepLabels = new Set()
  for (const c of searchSpace) {
    if (c.size >= minKeepSize) keepLabels.add(c.label)
  }
  let totalKeptSize = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FREE && !keepLabels.has(labels[i])) grid[i] = UNKNOWN
    else if (grid[i] === FREE) totalKeptSize++
  }
  return {
    largestSize,
    totalKeptSize,
    keptCount: keepLabels.size,
    usedInterior: interiorComponents.length > 0,
    candidateCount: searchSpace.length,
  }
}

function pruneWallsNotAdjacentToFree(grid, width, height) {
  const { components } = extractComponents(grid, width, height, WALL)
  let removed = 0
  let kept = 0
  for (const c of components) {
    let touchesFree = false
    for (const idx of c.indices) {
      const x = idx % width
      const y = (idx - x) / width
      for (let dy = -1; dy <= 1 && !touchesFree; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          if (grid[ny * width + nx] === FREE) {
            touchesFree = true
            break
          }
        }
      }
      if (touchesFree) break
    }
    if (touchesFree || isLikelyPillar(c)) {
      kept++
      continue
    }
    for (const idx of c.indices) {
      grid[idx] = UNKNOWN
      removed++
    }
  }
  return { kept, removed }
}

function greedyMesh(grid, width, height, targetValue) {
  const used = new Uint8Array(width * height)
  const rects = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (grid[idx] !== targetValue || used[idx]) continue
      let maxW = 0
      while (x + maxW < width && grid[y * width + x + maxW] === targetValue && !used[y * width + x + maxW]) maxW++
      let maxH = 1
      outer: for (let dy = 1; y + dy < height; dy++) {
        for (let dx = 0; dx < maxW; dx++) {
          const ni = (y + dy) * width + x + dx
          if (grid[ni] !== targetValue || used[ni]) break outer
        }
        maxH++
      }
      for (let dy = 0; dy < maxH; dy++) {
        for (let dx = 0; dx < maxW; dx++) used[(y + dy) * width + x + dx] = 1
      }
      rects.push({ x, y, w: maxW, h: maxH })
    }
  }
  return rects
}

function extractFreeBoundaryLoops(grid, width, height) {
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
        case 15: break
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
  const pKey = p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`
  const adjacency = new Map()
  for (let i = 0; i < segments.length; i++) {
    const ak = pKey(segments[i].a)
    const bk = pKey(segments[i].b)
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

function simplifyLoop(points, tolerance) {
  if (points.length <= 3) return points
  let maxDist = 0
  let idx1 = 0
  let idx2 = Math.floor(points.length / 2)
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1])
      if (d > maxDist) { maxDist = d; idx1 = i; idx2 = j }
    }
  }
  const half1 = points.slice(idx1, idx2 + 1)
  const half2 = [...points.slice(idx2), ...points.slice(0, idx1 + 1)]
  const s1 = rdpOpen(half1, tolerance)
  const s2 = rdpOpen(half2, tolerance)
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
    if (Math.abs(dz) <= Math.abs(dx) * tanT) next[1] = cur[1]
    else if (Math.abs(dx) <= Math.abs(dz) * tanT) next[0] = cur[0]
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

function dedupeLoop(loop) {
  if (loop.length === 0) return loop
  const result = []
  for (const p of loop) {
    const prev = result[result.length - 1]
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) result.push([p[0], p[1]])
  }
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) result.pop()
  }
  return result
}

function pruneShortSegments(loop, minLength) {
  const points = dedupeLoop(loop).map(p => [p[0], p[1]])
  if (points.length < 4) return points
  let guard = 0
  let changed = true
  while (changed && points.length >= 4 && guard++ < 10000) {
    changed = false
    for (let i = 0; i < points.length; i++) {
      const n = points.length
      if (n < 4) break
      const prev = points[(i - 1 + n) % n]
      const cur = points[i]
      const next = points[(i + 1) % n]
      const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
      const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1])
      const v1x = cur[0] - prev[0]
      const v1z = cur[1] - prev[1]
      const v2x = next[0] - cur[0]
      const v2z = next[1] - cur[1]
      const cross = v1x * v2z - v1z * v2x
      const dot = v1x * v2x + v1z * v2z
      const collinearForward = Math.abs(cross) <= 1e-6 && dot >= 0
      if (collinearForward || l1 < minLength || l2 < minLength) {
        points.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return points
}

function finalizeLoop(loop, imgHeight, offsetX, offsetZ, simplifyTolerance, minSegmentLength) {
  const world = gridLoopToWorld(loop, imgHeight, offsetX, offsetZ)
  const snapped1 = snapLoopToAxis(world, AXIS_SNAP_DEG)
  const simplified = simplifyLoop(snapped1, simplifyTolerance)
  const snapped2 = snapLoopToAxis(simplified, AXIS_SNAP_DEG)
  return dedupeLoop(pruneShortSegments(snapped2, minSegmentLength))
}

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

function nearestDistanceToLoop(point, loop) {
  let d = Infinity
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    d = Math.min(d, distToSegment(point, a, b))
  }
  return d
}

function nearestSegmentAngle(point, polylines) {
  let bestDist = Infinity
  let bestAngle = 0
  for (const loop of polylines) {
    if (loop.length < 2) continue
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const d = distToSegment(point, a, b)
      if (d < bestDist) {
        bestDist = d
        bestAngle = Math.atan2(b[1] - a[1], b[0] - a[0])
      }
    }
  }
  return { angle: bestAngle, distance: bestDist }
}

function computePrincipalAxes(polylines) {
  const axes = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  let diagAngle = null
  let diagLen = 0
  for (const loop of polylines) {
    if (loop.length < 2) continue
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 3.0) continue
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
      const nearOrthogonal = axes.slice(0, 4).some(ref => {
        let diff = angle - ref
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        return Math.abs(diff) < 0.2
      })
      if (!nearOrthogonal && len > diagLen) {
        diagLen = len
        diagAngle = angle
      }
    }
  }
  if (diagAngle !== null) {
    axes.push(diagAngle, diagAngle + Math.PI / 2, diagAngle + Math.PI, diagAngle - Math.PI / 2)
  }
  return axes
}

function snapYawToNearestAxis(rawAngle, principalAxes) {
  let a = rawAngle
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  let bestAngle = 0
  let bestDist = Infinity
  for (const ref of principalAxes) {
    let diff = a - ref
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    if (Math.abs(diff) < bestDist) {
      bestDist = Math.abs(diff)
      bestAngle = ref
    }
  }
  while (bestAngle > Math.PI) bestAngle -= 2 * Math.PI
  while (bestAngle < -Math.PI) bestAngle += 2 * Math.PI
  return bestAngle
}

function componentOrientedBBox(component, imgWidth) {
  const n = component.indices.length
  if (n < 2) return { angle: 0, w: RESOLUTION, d: RESOLUTION }

  let sumCol = 0, sumRow = 0
  for (const idx of component.indices) {
    const col = idx % imgWidth
    const row = (idx - col) / imgWidth
    sumCol += col
    sumRow += row
  }
  const meanCol = sumCol / n
  const meanRow = sumRow / n

  let scc = 0, srr = 0, scr = 0
  for (const idx of component.indices) {
    const col = idx % imgWidth
    const row = (idx - col) / imgWidth
    const dc = col - meanCol
    const dr = row - meanRow
    scc += dc * dc
    srr += dr * dr
    scr += dc * dr
  }

  // Principal axis angle in pixel space (direction of max variance)
  const thetaPx = 0.5 * Math.atan2(2 * scr, scc - srr)
  const cosT = Math.cos(thetaPx)
  const sinT = Math.sin(thetaPx)

  // Project all pixels onto principal axes to get oriented extent
  let minU = Infinity, maxU = -Infinity
  let minV = Infinity, maxV = -Infinity
  for (const idx of component.indices) {
    const col = idx % imgWidth
    const row = (idx - col) / imgWidth
    const dc = col - meanCol
    const dr = row - meanRow
    const u = dc * cosT + dr * sinT
    const v = -dc * sinT + dr * cosT
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }

  const extentU = (maxU - minU + 1) * RESOLUTION
  const extentV = (maxV - minV + 1) * RESOLUTION

  // World angle: negate pixel angle because row↓ maps to world Z↑
  return { angle: -thetaPx, w: extentU, d: extentV }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

async function main() {
  const deltaArg = process.argv.indexOf('--delta')
  const deltaImageName = deltaArg >= 0 ? process.argv[deltaArg + 1] : null

  const config = parseYamlMapConfig(YAML_PATH)
  RESOLUTION = config.resolution
  ORIGIN_X = config.originX
  ORIGIN_Y = config.originY
  const imagePath = resolve(ROOT, config.imageName)
  const imageExt = extname(config.imageName).toLowerCase()
  const isPgm = imageExt === '.pgm' || imageExt === '.pnm'
  const { wallThreshold, freeThreshold } = thresholdsFromYaml(config.occupiedThresh, config.freeThresh)

  console.log(`Reading map image: ${imagePath}`)
  const raster = isPgm
    ? null
    : await parseRasterImage(imagePath, config.negate)
  const { width, height, pixels } = isPgm
    ? parsePGM(imagePath)
    : raster
  const classifyMode = isPgm ? config.mode : 'scale'
  console.log(`  Dimensions: ${width}x${height}, resolution: ${RESOLUTION}`)
  console.log(`  mode: ${classifyMode}, thresholds -> wall <= ${wallThreshold}, free >= ${freeThreshold}`)

  let grid = isPgm
    ? classify(pixels, wallThreshold, freeThreshold, classifyMode)
    : classifyRaster(
      pixels,
      wallThreshold,
      Math.max(freeThreshold, 245),
      raster.backgroundValue,
      30,
    )
  if (!isPgm) {
    console.log(`  raster background(gray): ${raster.backgroundValue}, raster free cutoff: ${Math.max(freeThreshold, 245)}`)
  }
  console.log('Removing wall noise while preserving pillar-like components...')
  const firstCleanup = removeWallNoisePreservingPillars(grid, width, height)
  console.log(`  removed: ${firstCleanup.removed}, pillar-like kept: ${firstCleanup.pillarLike}`)

  grid = morphClose(grid, width, height)
  const secondCleanup = removeWallNoisePreservingPillars(grid, width, height)
  console.log(`  post-close removed: ${secondCleanup.removed}, pillar-like kept: ${secondCleanup.pillarLike}`)

  const enclosedResolve = resolveEnclosedRegions(grid, width, height)
  const freeSelection = keepSignificantFreeComponents(grid, width, height)
  console.log(
    `  enclosed regions: ${enclosedResolve.enclosedCount}, free-assigned: ${enclosedResolve.freeAssigned}, wall-assigned: ${enclosedResolve.wallAssigned}, largest-enclosed: ${enclosedResolve.largestEnclosedSize}, kept free: ${freeSelection.totalKeptSize} (${freeSelection.keptCount} components), interior-priority: ${freeSelection.usedInterior}, candidates: ${freeSelection.candidateCount}`,
  )
  const wallFilter = pruneWallsNotAdjacentToFree(grid, width, height)
  console.log(`  wall components kept near interior: ${wallFilter.kept}, wall pixels removed: ${wallFilter.removed}`)

  const rawFloorRects = greedyMesh(grid, width, height, FREE)
  let sumX = 0
  let sumZ = 0
  let totalArea = 0
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
  console.log(`  center offset: (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)

  const rawLoops = extractFreeBoundaryLoops(grid, width, height)
  const centerLoops = rawLoops
    .map(loop => finalizeLoop(loop, height, offsetX, offsetZ, CENTER_LOOP_SIMPLIFY_M, CENTER_LOOP_MIN_SEGMENT_M))
    .filter(loop => loop.length >= 3)

  let outerLoop = []
  let outerArea = -1
  for (const loop of centerLoops) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of loop) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    const a = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ)
    if (a > outerArea) {
      outerArea = a
      outerLoop = loop
    }
  }

  const wallExtract = extractComponents(grid, width, height, WALL)
  const { labels: wallLabels, components: wallComponents } = wallExtract
  const shelfLabels = new Set()
  const shelfComponentRects = []
  const shelfComponentObjects = []
  const pillarCandidateRects = []
  for (const c of wallComponents) {
    const [x1, z1] = pxToWorld(c.minX, c.minY, height)
    const [x2, z2] = pxToWorld(c.maxX + 1, c.maxY + 1, height)
    const w = Math.abs(x2 - x1)
    const d = Math.abs(z2 - z1)
    const cx = (x1 + x2) / 2 - offsetX
    const cz = (z1 + z2) / 2 - offsetZ
    const smallSide = Math.min(w, d)
    const longSide = Math.max(w, d)
    const area = w * d
    const aspect = longSide / Math.max(0.001, smallSide)
    const center = [cx, cz]
    const outerDistance = outerLoop.length > 0 ? nearestDistanceToLoop(center, outerLoop) : Infinity
    const nearOuterWall = outerDistance <= 2.0
    const pillar = (
      !c.touchesBoundary &&
      c.size >= 8 &&
      c.size <= 260 &&
      smallSide >= 0.2 &&
      smallSide <= 1.2 &&
      longSide <= 1.6 &&
      aspect <= 1.9 &&
      c.fillRatio >= 0.28 &&
      outerDistance > 0.35
    )
    const tinyPillar = (
      !c.touchesBoundary &&
      c.size >= 1 &&
      c.size <= 90 &&
      smallSide >= 0.03 &&
      smallSide <= 0.6 &&
      longSide <= 0.7 &&
      aspect <= 1.9 &&
      c.fillRatio >= 0.1
    )
    const pillarLike = pillar || tinyPillar
    const looksLikeShelfNearOuterWall = (
      !pillarLike &&
      !c.touchesBoundary &&
      nearOuterWall &&
      c.size >= 18 &&
      c.fillRatio >= 0.25 &&
      smallSide >= 0.2 &&
      smallSide <= 1.4 &&
      longSide >= 0.45 &&
      longSide <= 10 &&
      aspect >= 1.15 &&
      aspect <= 16 &&
      area >= 0.08 &&
      area <= 20
    )
    // ver1 interior shelf blocks are often square-ish and far from the outer boundary.
    const looksLikeInteriorShelfBlock = (
      !pillarLike &&
      !c.touchesBoundary &&
      !nearOuterWall &&
      c.size >= 20 &&
      c.fillRatio >= 0.45 &&
      smallSide >= 0.35 &&
      smallSide <= 1.8 &&
      longSide >= 0.35 &&
      longSide <= 2.2 &&
      aspect <= 2.6 &&
      area >= 0.12 &&
      area <= 4.84
    )
    const looksLikeShelf = looksLikeShelfNearOuterWall || looksLikeInteriorShelfBlock
    if (pillarLike) {
      pillarCandidateRects.push({
        label: c.label,
        size: c.size,
        rect: {
          cx: Math.round(cx * 1000) / 1000,
          cz: Math.round(cz * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          d: Math.round(d * 1000) / 1000,
        },
      })
      continue
    }
    if (looksLikeShelf) {
      shelfLabels.add(c.label)
      shelfComponentRects.push({
        cx: Math.round(cx * 1000) / 1000,
        cz: Math.round(cz * 1000) / 1000,
        w: Math.round(w * 1000) / 1000,
        d: Math.round(d * 1000) / 1000,
      })
      shelfComponentObjects.push(c)
    }
  }

  const PILLAR_DIAMETER = 0.2
  const PILLAR_COUNT = 3
  const PILLAR_CLUSTER_DIST = 15

  pillarCandidateRects.sort((a, b) => b.size - a.size)
  let bestCluster = pillarCandidateRects.slice(0, PILLAR_COUNT)
  if (pillarCandidateRects.length > PILLAR_COUNT) {
    let bestScore = -Infinity
    for (let seed = 0; seed < Math.min(pillarCandidateRects.length, 5); seed++) {
      const anchor = pillarCandidateRects[seed]
      const nearby = pillarCandidateRects
        .filter(v => {
          const d = Math.hypot(v.rect.cx - anchor.rect.cx, v.rect.cz - anchor.rect.cz)
          return d < PILLAR_CLUSTER_DIST
        })
        .slice(0, PILLAR_COUNT)
      const score = nearby.reduce((s, v) => s + v.size, 0)
      if (nearby.length >= PILLAR_COUNT && score > bestScore) {
        bestScore = score
        bestCluster = nearby
      }
    }
  }

  const pillarLabels = new Set(bestCluster.map(v => v.label))
  const pillarRects = bestCluster.map(v => ({
    cx: v.rect.cx,
    cz: v.rect.cz,
    w: PILLAR_DIAMETER,
    d: PILLAR_DIAMETER,
  }))
  console.log(`  pillar candidates: ${pillarCandidateRects.length}, selected: ${bestCluster.length} (cluster within ${PILLAR_CLUSTER_DIST}m)`)
  bestCluster.forEach((v, i) => console.log(`    pillar ${i}: cx=${v.rect.cx} cz=${v.rect.cz} size=${v.size}`))

  const wallGrid = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL) continue
    const label = wallLabels[i]
    if (pillarLabels.has(label)) continue
    else if (shelfLabels.has(label)) continue
    else wallGrid[i] = WALL
  }

  const rawWallRects = greedyMesh(wallGrid, width, height, WALL)
  const wallRects = pixelRectsToWorld(rawWallRects, height, offsetX, offsetZ)
  const bookshelfRects = shelfComponentRects

  const renderBoundaryGrid = new Uint8Array(grid)
  for (let i = 0; i < renderBoundaryGrid.length; i++) {
    if (grid[i] !== WALL) continue
    const label = wallLabels[i]
    if (pillarLabels.has(label) || shelfLabels.has(label)) renderBoundaryGrid[i] = FREE
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL) continue
    const label = wallLabels[i]
    if (!pillarLabels.has(label)) continue
    const px = i % width
    const py = (i - px) / width
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const ni = ny * width + nx
        if (renderBoundaryGrid[ni] === WALL) renderBoundaryGrid[ni] = FREE
      }
    }
  }

  const MIN_LOOP_AREA_M2 = 0.1
  const rawRenderLoops = extractFreeBoundaryLoops(renderBoundaryGrid, width, height)

  const classifiedRaw = rawRenderLoops.map(rawLoop => {
    let sx = 0, sy = 0
    for (const [rpx, rpy] of rawLoop) { sx += rpx; sy += rpy }
    const centroidCol = Math.round(sx / rawLoop.length)
    const centroidRow = Math.round(sy / rawLoop.length)
    let isRoom = false
    if (centroidCol >= 0 && centroidCol < width && centroidRow >= 0 && centroidRow < height) {
      isRoom = renderBoundaryGrid[centroidRow * width + centroidCol] === FREE
    }
    return { rawLoop, isRoom }
  })

  const classifiedLoops = []
  for (const { rawLoop, isRoom } of classifiedRaw) {
    const renderFinalized = finalizeLoop(rawLoop, height, offsetX, offsetZ, RENDER_LOOP_SIMPLIFY_M, RENDER_LOOP_MIN_SEGMENT_M)
    if (renderFinalized.length < 3) continue
    const renderArea = Math.abs(loopSignedArea(renderFinalized))
    if (renderArea < MIN_LOOP_AREA_M2) continue

    const holeFinalized = isRoom
      ? renderFinalized
      : finalizeLoop(rawLoop, height, offsetX, offsetZ, HOLE_LOOP_SIMPLIFY_M, HOLE_LOOP_MIN_SEGMENT_M)

    classifiedLoops.push({
      renderLoop: renderFinalized,
      holeLoop: holeFinalized.length >= 3 ? holeFinalized : renderFinalized,
      area: renderArea,
      isRoom,
    })
  }

  let outerLoopIdx = 0
  let outerLoopArea = 0
  for (let i = 0; i < classifiedLoops.length; i++) {
    if (classifiedLoops[i].area > outerLoopArea) {
      outerLoopArea = classifiedLoops[i].area
      outerLoopIdx = i
    }
  }
  const wallPolylines = classifiedLoops.map(c => c.renderLoop)
  const wallHolePolylines = classifiedLoops
    .filter((c, i) => i !== outerLoopIdx && !c.isRoom)
    .map(c => c.holeLoop)
  console.log(`  classified loops: ${classifiedLoops.length} total, ${wallHolePolylines.length} holes, ${classifiedLoops.filter(c => c.isRoom).length} rooms`)
  const fallbackPolylines = wallPolylines.length > 0 ? wallPolylines : centerLoops
  const principalAxes = computePrincipalAxes(fallbackPolylines)
  console.log(`  principal axes: [${principalAxes.map(a => a.toFixed(4)).join(', ')}]`)

  let finalBookshelfRects = bookshelfRects
  let finalBookshelfInstances

  if (deltaImageName) {
    console.log(`\nDelta mode: extracting new shelves from ${deltaImageName}`)
    const deltaPath = resolve(ROOT, deltaImageName)
    const deltaRaster = await parseRasterImage(deltaPath, config.negate)
    const dw = deltaRaster.width
    const dh = deltaRaster.height

    let deltaGrid = classifyRaster(deltaRaster.pixels, wallThreshold, Math.max(freeThreshold, 245), deltaRaster.backgroundValue, 30)
    removeWallNoisePreservingPillars(deltaGrid, dw, dh)
    deltaGrid = morphClose(deltaGrid, dw, dh)
    removeWallNoisePreservingPillars(deltaGrid, dw, dh)

    console.log(`  delta image: ${dw}x${dh}, base: ${width}x${height}`)

    const deltaWallGrid = new Uint8Array(dw * dh)
    let deltaCount = 0
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const di = y * dw + x
        if (deltaGrid[di] !== WALL) continue
        const baseIsWall = (x < width && y < height) ? grid[y * width + x] === WALL : false
        if (!baseIsWall) {
          deltaWallGrid[di] = WALL
          deltaCount++
        }
      }
    }
    console.log(`  delta wall pixels: ${deltaCount}`)

    const baseWorldMinX = ORIGIN_X - offsetX
    const baseWorldMaxX = ORIGIN_X + (width - 1) * RESOLUTION - offsetX
    const baseWorldMinZ = ORIGIN_Y - offsetZ
    const baseWorldMaxZ = ORIGIN_Y + (height - 1) * RESOLUTION - offsetZ

    const closedDelta = morphClose(deltaWallGrid, dw, dh)
    const { components: deltaComponents } = extractComponents(closedDelta, dw, dh, WALL)
    const deltaShelfRects = []
    const deltaShelfComponents = []
    for (const c of deltaComponents) {
      const [x1, z1] = pxToWorld(c.minX, c.minY, dh)
      const [x2, z2] = pxToWorld(c.maxX + 1, c.maxY + 1, dh)
      const w = Math.abs(x2 - x1)
      const d = Math.abs(z2 - z1)
      const cx = (x1 + x2) / 2 - offsetX
      const cz = (z1 + z2) / 2 - offsetZ
      const smallSide = Math.min(w, d)
      const longSide = Math.max(w, d)

      const inBaseArea = (
        cx >= baseWorldMinX + 1 && cx <= baseWorldMaxX - 1 &&
        cz >= baseWorldMinZ + 1 && cz <= baseWorldMaxZ - 1
      )

      const isShelf = (
        !c.touchesBoundary &&
        inBaseArea &&
        c.size >= 15 &&
        smallSide >= 0.9 &&
        smallSide <= 2.5 &&
        longSide >= 1.0 &&
        longSide <= 3.0
      )

      if (isShelf) {
        deltaShelfRects.push({
          cx: Math.round(cx * 1000) / 1000,
          cz: Math.round(cz * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          d: Math.round(d * 1000) / 1000,
        })
        deltaShelfComponents.push(c)
      }
    }

    console.log(`  delta components: ${deltaComponents.length}, shelf candidates: ${deltaShelfRects.length}`)
    deltaShelfRects.forEach((r, i) => console.log(`    shelf ${i}: cx=${r.cx} cz=${r.cz} w=${r.w} d=${r.d}`))

    finalBookshelfRects = deltaShelfRects

    finalBookshelfInstances = deltaShelfRects.map((r, i) => {
      const comp = deltaShelfComponents[i]
      const obb = componentOrientedBBox(comp, dw)
      const longSide = Math.max(obb.w, obb.d)
      const shortSide = Math.min(obb.w, obb.d)
      const rawAngle = obb.w >= obb.d ? obb.angle : obb.angle + Math.PI / 2
      const nearest = nearestSegmentAngle([r.cx, r.cz], fallbackPolylines)
      const wallAxis = snapYawToNearestAxis(nearest.angle, principalAxes)
      const wallCandidates = [wallAxis, wallAxis + Math.PI / 2, wallAxis - Math.PI / 2, wallAxis + Math.PI]
      const snappedYaw = snapYawToNearestAxis(rawAngle, wallCandidates)
      return {
        cx: r.cx,
        cz: r.cz,
        w: Math.round(longSide * 1000) / 1000,
        d: Math.round(shortSide * 1000) / 1000,
        yaw: Math.round(snappedYaw * 10000) / 10000,
      }
    })
  } else {
    finalBookshelfInstances = bookshelfRects.map((r, i) => {
      const comp = shelfComponentObjects[i]
      const obb = componentOrientedBBox(comp, width)
      const longSide = Math.max(obb.w, obb.d)
      const shortSide = Math.min(obb.w, obb.d)
      const rawAngle = obb.w >= obb.d ? obb.angle : obb.angle + Math.PI / 2
      // Snap to wall-aligned axes: nearest wall direction ± 90°
      const nearest = nearestSegmentAngle([r.cx, r.cz], fallbackPolylines)
      const wallAxis = snapYawToNearestAxis(nearest.angle, principalAxes)
      const wallCandidates = [wallAxis, wallAxis + Math.PI / 2, wallAxis - Math.PI / 2, wallAxis + Math.PI]
      const snappedYaw = snapYawToNearestAxis(rawAngle, wallCandidates)
      return {
        cx: r.cx,
        cz: r.cz,
        w: Math.round(longSide * 1000) / 1000,
        d: Math.round(shortSide * 1000) / 1000,
        yaw: Math.round(snappedYaw * 10000) / 10000,
      }
    })
  }

  const floorRects = pixelRectsToWorld(rawFloorRects, height, offsetX, offsetZ)

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const r of [...wallRects, ...finalBookshelfRects, ...floorRects]) {
    minX = Math.min(minX, r.cx - r.w / 2)
    maxX = Math.max(maxX, r.cx + r.w / 2)
    minZ = Math.min(minZ, r.cz - r.d / 2)
    maxZ = Math.max(maxZ, r.cz + r.d / 2)
  }
  const mapWidth = Math.round((maxX - minX) * 100) / 100
  const mapDepth = Math.round((maxZ - minZ) * 100) / 100

  const sourceLabel = deltaImageName ? `${config.imageName} + delta ${deltaImageName}` : config.imageName
  const ts = `// Auto-generated from ${sourceLabel} — do not edit manually.
// Run: node scripts/processMap.mjs${deltaImageName ? ' --delta ' + deltaImageName : ''}

export type WallRect = { cx: number; cz: number; w: number; d: number }
export type BookshelfInstance = { cx: number; cz: number; w: number; d: number; yaw: number }
export type Point2 = [number, number]

export const MAP_RESOLUTION = ${RESOLUTION}
export const mapWidth = ${mapWidth}
export const mapDepth = ${mapDepth}

export const wallRects: WallRect[] = ${JSON.stringify(wallRects)}
export const bookshelfRects: WallRect[] = ${JSON.stringify(finalBookshelfRects)}
export const bookshelfInstances: BookshelfInstance[] = ${JSON.stringify(finalBookshelfInstances)}
export const pillarRects: WallRect[] = ${JSON.stringify(pillarRects)}
export const wallPolylines: Point2[][] = ${JSON.stringify(wallPolylines)}
export const wallHolePolylines: Point2[][] = ${JSON.stringify(wallHolePolylines)}
export const floorRects: WallRect[] = ${JSON.stringify(floorRects)}
`
  const outPath = resolve(ROOT, 'src', 'data', 'mapData.ts')
  writeFileSync(outPath, ts, 'utf-8')
  console.log(`Wrote ${outPath}`)
  console.log(`  wallRects: ${wallRects.length}`)
  console.log(`  bookshelfRects: ${finalBookshelfRects.length}`)
  console.log(`  pillarRects: ${pillarRects.length}`)
  console.log(`  wallPolylines: ${wallPolylines.length}, wallHolePolylines: ${wallHolePolylines.length}`)
  console.log(`  floorRects: ${floorRects.length}`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
