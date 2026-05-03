import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const WALL = 1
const FREE = 2
const UNKNOWN = 0

const DEFAULT_IMAGE = 'map_info/b2floor_edited.pgm'
/** Canonical map YAML (image path inside is relative to repo root). */
const YAML_PATH = resolve(ROOT, 'map_info/b2floor_edited.yaml')
/**
 * CLI: `--image <path>`, `--delta <path>`, `--map-offset-only`
 * - `--raw-map` — skip wall-noise removal, morphClose, pruneWallsNotAdjacentToFree
 * - `--classify-mode trinary|scale` — PGM only; overrides YAML `mode`
 * - `--dump-classified-pgm <path>` — write classified grid (0/127/255) after the above steps
 */

const MIN_CLUSTER_SIZE = 28
/** Looser snap reduces stair-stepping along diagonals vs strict Manhattan alignment. */
const AXIS_SNAP_DEG = 22
const CENTER_LOOP_SIMPLIFY_M = 0.15
const RENDER_LOOP_SIMPLIFY_M = 0.38
const HOLE_LOOP_SIMPLIFY_M = 0.08
const KEEPOUT_LOOP_SIMPLIFY_M = 0.04
const CENTER_LOOP_MIN_SEGMENT_M = 0.12
const RENDER_LOOP_MIN_SEGMENT_M = 0.28
const HOLE_LOOP_MIN_SEGMENT_M = 0.08
const KEEPOUT_LOOP_MIN_SEGMENT_M = 0.04

const FORCED_UNKNOWN_ISOLATED_AREAS = [
  { surface: 'floor', cx: -5.560, cz: -4.861, radius: 0.350 },
  { surface: 'wall', cx: -15.810, cz: -1.820, radius: 0.350 },
]
/** Sync with `src/data/excludedMapBookshelfIds.ts` — keepout 장애물만 두고 bookshelf 배열에서는 제외 */
const KEEPOUT_EXCLUDE_BOOKSHELF_IDS = new Set(['shelf_018', 'shelf_022'])

const KEEPOUT_BOOKSHELF_WALL_TARGETS = [
  { shelfId: 'shelf_013', surface: 'floor', cx: 10.123, cz: -7.212, radius: 0.350 },
  { shelfId: 'shelf_014', surface: 'floor', cx: 13.065, cz: -5.885, radius: 0.350 },
  { shelfId: 'shelf_015', surface: 'floor', cx: 19.309, cz: -5.737, radius: 0.350 },
  { shelfId: 'shelf_018', surface: 'floor', cx: -6.689, cz: -4.449, radius: 0.350 },
  { shelfId: 'shelf_019', surface: 'floor', cx: -12.978, cz: -4.429, radius: 0.350 },
  { shelfId: 'shelf_020', surface: 'floor', cx: 17.508, cz: -4.002, radius: 0.350 },
  { shelfId: 'shelf_021', surface: 'floor', cx: -8.763, cz: -2.962, radius: 0.350 },
  { shelfId: 'shelf_022', surface: 'floor', cx: -14.371, cz: -2.930, radius: 0.350 },
  { shelfId: 'shelf_023', surface: 'floor', cx: 20.989, cz: -2.461, radius: 0.350 },
  { shelfId: 'shelf_024', surface: 'floor', cx: 29.006, cz: -1.479, radius: 0.350 },
  { shelfId: 'shelf_025', surface: 'floor', cx: 25.932, cz: -0.387, radius: 0.350 },
  { shelfId: 'shelf_026', surface: 'floor', cx: -18.656, cz: 1.366, radius: 0.350 },
  { shelfId: 'shelf_027', surface: 'floor', cx: 30.537, cz: 1.607, radius: 0.350 },
  { shelfId: 'shelf_028', surface: 'floor', cx: 38.550, cz: 2.677, radius: 0.350 },
  { shelfId: 'shelf_033', surface: 'floor', cx: 43.620, cz: 4.814, radius: 0.350 },
  { shelfId: 'shelf_034', surface: 'floor', cx: 39.645, cz: 5.575, radius: 0.350 },
]
const KEEPOUT_BACKSPACE_UNKNOWN_AREAS = [
  { surface: 'floor', cx: -15.213, cz: -1.067, radius: 0.350 },
  { surface: 'floor', cx: -6.329, cz: -6.295, radius: 0.350 },
  { surface: 'floor', cx: 40.366, cz: 4.740, radius: 0.350 },
  { surface: 'floor', cx: 28.451, cz: -0.324, radius: 0.350 },
  { surface: 'floor', cx: 19.567, cz: -4.396, radius: 0.350 },
  { surface: 'floor', cx: 10.365, cz: -8.448, radius: 0.350 },
  { surface: 'floor', cx: 6.184, cz: -9.521, radius: 0.350 },
]
/** 복도 축 샘플 (circle-area). `clearShelfFootprintAndCorridorApronPixels`가 전면 확장 방향 판별에 사용. */
const CORRIDOR_CIRCLE_AREAS = [
  { cx: 41.258, cz: 4.934, radius: 0.350 },
  { cx: 33.416, cz: 1.762, radius: 0.350 },
  { cx: 24.243, cz: -2.305, radius: 0.350 },
  { cx: 16.146, cz: -5.429, radius: 0.350 },
  { cx: 10.435, cz: -8.423, radius: 0.350 },
  { cx: 6.184, cz: -9.521, radius: 0.350 },
]
const DELTA_TARGET_WALL_AREAS = [
  { surface: 'floor', cx: -6.892, cz: -4.451, radius: 0.350 },
  { surface: 'floor', cx: -14.457, cz: -2.989, radius: 0.350 },
]
/** circle-area (offset-world): 잘못 잡힌 기둥 제거 — 원 내부 WALL을 FREE로 깎음. */
const PILLAR_DELETE_OPEN_AREAS = [{ cx: -9.812, cz: 14.386, radius: 0.350 }]
/** circle-area (offset-world): 기둥 휴리스틱 스킵 — PGM 벽을 wallGrid/폴리라인에 그대로 유지. */
const PILLAR_FORCE_WALL_CIRCLE_AREAS = [{ cx: 0.716, cz: -12.211, radius: 0.350 }]
const FORCED_UNKNOWN_SCAN_MAX_M = 8.0
const FORCED_UNKNOWN_ROOM_MIN_SIDE_M = 1.0
const FORCED_UNKNOWN_ROOM_MAX_SIDE_M = 20.0
const FORCED_UNKNOWN_ROOM_MAX_PIXELS = 45000
const FORCED_UNKNOWN_ROOM_MAX_ASPECT = 20.0

let RESOLUTION = 0.05
let ORIGIN_X = -53.4
let ORIGIN_Y = -19.1
let PIXEL_MODE = false

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

/** Strip optional YAML-style surrounding quotes from simple-parser values. */
function unwrapYamlScalar(value) {
  let s = String(value ?? '').trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }
  return s
}

function parseYamlMapConfig(path) {
  const data = parseSimpleYaml(path)
  const imageName = unwrapYamlScalar(data.image) || DEFAULT_IMAGE
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

/** YAML `negate: 1` — same rule as map_server / parseRasterImage (invert gray before thresholds). */
function applyNegateInPlaceUint8(pixels, maxval, negate) {
  if (negate !== 1) return
  const m = Math.max(1, Math.min(255, maxval | 0))
  for (let i = 0; i < pixels.length; i++) pixels[i] = m - pixels[i]
}

/** Debug: WALL=dark, FREE=bright, UNKNOWN=mid (trinary visualization). */
function writeClassifiedGridPGM(filepath, grid, width, height) {
  const dir = dirname(filepath)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* exists */
  }
  const body = new Uint8Array(width * height)
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    body[i] = v === WALL ? 0 : v === FREE ? 255 : 127
  }
  const header = `P5\n${width} ${height}\n255\n`
  writeFileSync(filepath, Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(body)]))
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
  // Keep world Z aligned with image row direction (no vertical flip).
  const wz = ORIGIN_Y + row * RESOLUTION
  return [wx, wz]
}

/** Offset-world 원 내부의 벽 픽셀을 통로로 연다. */
function carveWallToFreeInCircles(grid, width, height, offsetX, offsetZ, areas) {
  if (!areas.length) return 0
  let changed = 0
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      if (grid[idx] !== WALL) continue
      const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
      const ox = wx - offsetX
      const oz = wz - offsetZ
      for (const a of areas) {
        if (Math.hypot(ox - a.cx, oz - a.cz) <= a.radius) {
          grid[idx] = FREE
          changed++
          break
        }
      }
    }
  }
  return changed
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
    let originalFreeCount = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (localStack.length > 0) {
      const idx = localStack.pop()
      if (visited[idx] || grid[idx] === WALL || enclosedLabels[idx] !== 0) continue
      enclosedLabels[idx] = label
      size++
      if (grid[idx] === FREE) originalFreeCount++
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
      originalFreeCount,
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
  let unknownAssigned = 0
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
    } else if (c.originalFreeCount === 0) {
      // Grey / UNKNOWN-only voids (e.g. keepout): do not promote to walkable FREE.
      if (grid[i] !== UNKNOWN) unknownAssigned++
      grid[i] = UNKNOWN
    } else {
      if (grid[i] !== FREE) freeAssigned++
      grid[i] = FREE
    }
  }
  return {
    enclosedCount: enclosedComponents.length,
    freeAssigned,
    wallAssigned,
    unknownAssigned,
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

function forceUnknownForIsolatedAreas(grid, width, height, offsetX, offsetZ, areas) {
  const maxScanPx = Math.max(8, Math.round(FORCED_UNKNOWN_SCAN_MAX_M / RESOLUTION))
  const minSidePx = Math.max(2, Math.round(FORCED_UNKNOWN_ROOM_MIN_SIDE_M / RESOLUTION))
  const maxSidePx = Math.max(4, Math.round(FORCED_UNKNOWN_ROOM_MAX_SIDE_M / RESOLUTION))
  const blocked = new Uint8Array(grid.length)
  const freeExtract = extractComponents(grid, width, height, FREE)
  let largestFreeSize = 0
  for (const c of freeExtract.components) {
    if (c.size > largestFreeSize) largestFreeSize = c.size
  }
  const fallbackCandidates = freeExtract.components.filter(c =>
    !c.touchesBoundary &&
    c.size < largestFreeSize &&
    c.size <= FORCED_UNKNOWN_ROOM_MAX_PIXELS &&
    c.aspect <= 3.4,
  )
  const areaMatches = []

  const worldCenteredToPixel = (cx, cz) => {
    const wx = cx + offsetX
    const wz = cz + offsetZ
    const col = Math.round((wx - ORIGIN_X) / RESOLUTION)
    const row = Math.round((wz - ORIGIN_Y) / RESOLUTION)
    return { col, row }
  }

  const scanToWall = (startCol, startRow, stepCol, stepRow) => {
    for (let step = 0; step <= maxScanPx; step++) {
      const col = startCol + stepCol * step
      const row = startRow + stepRow * step
      if (col < 0 || col >= width || row < 0 || row >= height) return -1
      const idx = row * width + col
      if (grid[idx] === WALL) return step
    }
    return -1
  }

  const fallbackCarveByComponent = (area) => {
    let matched = null
    let bestDist = Infinity
    for (const c of fallbackCandidates) {
      for (const idx of c.indices) {
        const col = idx % width
        const row = (idx - col) / width
        const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
        const distCentered = Math.hypot((wx - offsetX) - area.cx, (wz - offsetZ) - area.cz)
        const distAbsolute = Math.hypot(wx - area.cx, wz - area.cz)
        const dist = Math.min(distCentered, distAbsolute)
        if (dist <= area.radius && dist < bestDist) {
          bestDist = dist
          matched = c
        }
      }
    }
    if (!matched) return { changed: 0, size: 0, reason: 'fallback-no-match' }
    let changed = 0
    for (const idx of matched.indices) {
      if (blocked[idx]) continue
      if (grid[idx] !== FREE) continue
      blocked[idx] = 1
      grid[idx] = UNKNOWN
      changed++
    }
    return { changed, size: matched.size, reason: changed > 0 ? 'fallback-ok' : 'fallback-empty' }
  }

  let candidateComponentCount = 0
  for (const area of areas) {
    const seed = worldCenteredToPixel(area.cx, area.cz)
    if (seed.col < 0 || seed.col >= width || seed.row < 0 || seed.row >= height) {
      areaMatches.push({ area, label: 0, distance: Infinity, size: 0, reason: 'seed-oob' })
      continue
    }

    // If center lands on wall/unknown, search nearest free pixel within the given radius.
    let seedCol = seed.col
    let seedRow = seed.row
    const seedIdx = seedRow * width + seedCol
    if (grid[seedIdx] !== FREE) {
      const radiusPx = Math.max(1, Math.round(area.radius / RESOLUTION))
      let bestDist = Infinity
      let bestCol = -1
      let bestRow = -1
      for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          const col = seed.col + dx
          const row = seed.row + dy
          if (col < 0 || col >= width || row < 0 || row >= height) continue
          const dist = Math.hypot(dx, dy)
          if (dist > radiusPx) continue
          if (grid[row * width + col] !== FREE) continue
          if (dist < bestDist) {
            bestDist = dist
            bestCol = col
            bestRow = row
          }
        }
      }
      if (bestCol < 0) {
        areaMatches.push({ area, label: 0, distance: Infinity, size: 0, reason: 'no-free-near-center' })
        continue
      }
      seedCol = bestCol
      seedRow = bestRow
    }

    const left = scanToWall(seedCol, seedRow, -1, 0)
    const right = scanToWall(seedCol, seedRow, 1, 0)
    const up = scanToWall(seedCol, seedRow, 0, -1)
    const down = scanToWall(seedCol, seedRow, 0, 1)
    if (left < 0 || right < 0 || up < 0 || down < 0) {
      areaMatches.push({ area, label: 0, distance: Infinity, size: 0, reason: 'wall-not-found' })
      continue
    }

    const minCol = seedCol - left + 1
    const maxCol = seedCol + right - 1
    const minRow = seedRow - up + 1
    const maxRow = seedRow + down - 1
    const boxW = maxCol - minCol + 1
    const boxH = maxRow - minRow + 1
    const boxSize = boxW * boxH
    const aspect = boxW > boxH ? boxW / Math.max(1, boxH) : boxH / Math.max(1, boxW)
    if (
      boxW < minSidePx ||
      boxH < minSidePx ||
      boxW > maxSidePx ||
      boxH > maxSidePx ||
      boxSize > FORCED_UNKNOWN_ROOM_MAX_PIXELS ||
      aspect > FORCED_UNKNOWN_ROOM_MAX_ASPECT
    ) {
      const fallback = fallbackCarveByComponent(area)
      if (fallback.changed > 0) {
        candidateComponentCount++
        let radiusChanged = 0
        const radiusPx = Math.max(1, Math.ceil(area.radius / RESOLUTION) + 1)
        for (let dy = -radiusPx; dy <= radiusPx; dy++) {
          for (let dx = -radiusPx; dx <= radiusPx; dx++) {
            const col = seed.col + dx
            const row = seed.row + dy
            if (col < 0 || col >= width || row < 0 || row >= height) continue
            const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
            const dist = Math.hypot((wx - offsetX) - area.cx, (wz - offsetZ) - area.cz)
            if (dist > area.radius) continue
            const idx = row * width + col
            if (blocked[idx]) continue
            if (grid[idx] !== FREE) continue
            blocked[idx] = 1
            grid[idx] = UNKNOWN
            radiusChanged++
          }
        }
        areaMatches.push({
          area,
          label: candidateComponentCount,
          distance: 0,
          size: fallback.changed + radiusChanged,
          reason: `${fallback.reason}+radius`,
        })
      } else {
        areaMatches.push({ area, label: 0, distance: Infinity, size: boxSize, reason: 'box-filtered' })
      }
      continue
    }

    candidateComponentCount++
    let changed = 0
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const idx = row * width + col
        if (blocked[idx]) continue
        if (grid[idx] !== FREE) continue
        blocked[idx] = 1
        grid[idx] = UNKNOWN
        changed++
      }
    }
    let radiusChanged = 0
    const radiusPx = Math.max(1, Math.ceil(area.radius / RESOLUTION) + 1)
    for (let dy = -radiusPx; dy <= radiusPx; dy++) {
      for (let dx = -radiusPx; dx <= radiusPx; dx++) {
        const col = seed.col + dx
        const row = seed.row + dy
        if (col < 0 || col >= width || row < 0 || row >= height) continue
        const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
        const dist = Math.hypot((wx - offsetX) - area.cx, (wz - offsetZ) - area.cz)
        if (dist > area.radius) continue
        const idx = row * width + col
        if (blocked[idx]) continue
        if (grid[idx] !== FREE) continue
        blocked[idx] = 1
        grid[idx] = UNKNOWN
        radiusChanged++
      }
    }
    areaMatches.push({ area, label: candidateComponentCount, distance: 0, size: changed + radiusChanged, reason: 'ok+radius' })
  }

  let changedPixels = 0
  for (let i = 0; i < blocked.length; i++) {
    if (blocked[i]) changedPixels++
  }
  return {
    targetedComponentCount: areaMatches.filter(v => v.label !== 0).length,
    changedPixels,
    areaMatches,
    candidateComponentCount,
  }
}

function selectDeltaWallComponentsNearAreas(components, width, height, offsetX, offsetZ, areas) {
  const pixelCenters = components.map((c) => {
    const pts = c.indices.map((idx) => {
      const col = idx % width
      const row = (idx - col) / width
      const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
      return [wx - offsetX, wz - offsetZ]
    })
    return { component: c, pts }
  })
  const selected = []
  const usedLabels = new Set()
  for (const area of areas) {
    let best = null
    let bestDist = Infinity
    for (const entry of pixelCenters) {
      const c = entry.component
      if (usedLabels.has(c.label)) continue
      for (const p of entry.pts) {
        const d = Math.hypot(p[0] - area.cx, p[1] - area.cz)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
    }
    if (!best) continue
    // Keep matching strict around requested circle-area neighborhood.
    if (bestDist > area.radius + 0.9) continue
    usedLabels.add(best.label)
    selected.push({ area, component: best, distance: bestDist })
  }
  return selected
}

function markBlockedBackspaceUnknownNearAreas(grid, width, height, offsetX, offsetZ, areas) {
  const freeExtract = extractComponents(grid, width, height, FREE)
  let largestFree = 0
  for (const c of freeExtract.components) largestFree = Math.max(largestFree, c.size)
  const changedByArea = []
  let totalChanged = 0
  for (const area of areas) {
    let best = null
    let bestDist = Infinity
    for (const c of freeExtract.components) {
      if (c.touchesBoundary) continue
      if (c.size > Math.max(200, Math.floor(largestFree * 0.2))) continue
      for (const idx of c.indices) {
        const col = idx % width
        const row = (idx - col) / width
        const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
        const d = Math.hypot((wx - offsetX) - area.cx, (wz - offsetZ) - area.cz)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
    }
    if (!best || bestDist > area.radius + 1.2) {
      changedByArea.push({ area, changed: 0, reason: 'no-near-enclosed-free' })
      continue
    }
    let changed = 0
    for (const idx of best.indices) {
      if (grid[idx] !== FREE) continue
      grid[idx] = UNKNOWN
      changed++
    }
    totalChanged += changed
    changedByArea.push({ area, changed, reason: changed > 0 ? 'ok' : 'empty' })
  }
  return { totalChanged, changedByArea }
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

function extractBoundaryLoops(grid, width, height, targetValue = FREE) {
  const segments = []
  const inside = (x, y) => grid[y * width + x] === targetValue
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

function extractFreeBoundaryLoops(grid, width, height) {
  return extractBoundaryLoops(grid, width, height, FREE)
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
  if (PIXEL_MODE) {
    // Pixel mode: keep the polyline as-is (no axis snapping / RDP simplification / short segment pruning).
    return dedupeLoop(world)
  }
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

function componentOrientedBookshelfInstance(component, imgWidth, imgHeight, offsetX, offsetZ) {
  const n = component.indices.length
  if (n < 2) {
    const [wx, wz] = pxToWorld(component.minX + 0.5, component.minY + 0.5, imgHeight)
    return {
      cx: Math.round((wx - offsetX) * 1000) / 1000,
      cz: Math.round((wz - offsetZ) * 1000) / 1000,
      w: RESOLUTION,
      d: RESOLUTION,
      yaw: 0,
    }
  }

  let sumCol = 0
  let sumRow = 0
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

  const thetaPx = 0.5 * Math.atan2(2 * scr, scc - srr)
  const cosT = Math.cos(thetaPx)
  const sinT = Math.sin(thetaPx)
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

  const centerU = (minU + maxU) * 0.5
  const centerV = (minV + maxV) * 0.5
  const centerCol = meanCol + centerU * cosT - centerV * sinT
  const centerRow = meanRow + centerU * sinT + centerV * cosT
  const [wx, wz] = pxToWorld(centerCol + 0.5, centerRow + 0.5, imgHeight)
  const extentU = (maxU - minU + 1) * RESOLUTION
  const extentV = (maxV - minV + 1) * RESOLUTION
  const useU = extentU >= extentV
  const rawYaw = useU ? -thetaPx : -thetaPx + Math.PI / 2
  return {
    cx: Math.round((wx - offsetX) * 1000) / 1000,
    cz: Math.round((wz - offsetZ) * 1000) / 1000,
    w: Math.round(Math.max(extentU, extentV) * 1000) / 1000,
    d: Math.round(Math.min(extentU, extentV) * 1000) / 1000,
    yaw: Math.round(snapYawToNearestAxis(rawYaw, [rawYaw]) * 10000) / 10000,
  }
}

function componentToMask(component, width, height) {
  const mask = new Uint8Array(width * height)
  for (const idx of component.indices) mask[idx] = WALL
  return mask
}

function extractKeepoutBookshelves(keepoutImageName, width, height, offsetX, offsetZ, wallTargets = []) {
  const keepoutPath = resolve(ROOT, keepoutImageName)
  const keepoutExt = extname(keepoutImageName).toLowerCase()
  if (keepoutExt !== '.pgm' && keepoutExt !== '.pnm') {
    throw new Error(`--keepout currently expects a PGM/PNM mask, got ${keepoutImageName}`)
  }

  const pgm = parsePGM(keepoutPath)
  if (pgm.width !== width || pgm.height !== height) {
    throw new Error(`Keepout image size must match base map size: keepout=${pgm.width}x${pgm.height}, base=${width}x${height}`)
  }

  const keepoutGrid = new Uint8Array(width * height)
  for (let i = 0; i < pgm.pixels.length; i++) {
    if (pgm.pixels[i] <= 127) keepoutGrid[i] = WALL
  }

  const { components } = extractComponents(keepoutGrid, width, height, WALL)
  const selectedWallComponents = selectDeltaWallComponentsNearAreas(
    components,
    width,
    height,
    offsetX,
    offsetZ,
    wallTargets,
  )
  const excludeBookshelfLabels = new Set()
  for (const sel of selectedWallComponents) {
    const id = sel.area.shelfId
    if (id && KEEPOUT_EXCLUDE_BOOKSHELF_IDS.has(id)) excludeBookshelfLabels.add(sel.component.label)
  }
  const bookshelfPolygons = []
  const bookshelfInstances = []
  const bookshelfRects = []
  const bookshelfComponents = []
  for (const component of components) {
    if (excludeBookshelfLabels.has(component.label)) continue
    if (component.size < 8) continue
    const mask = componentToMask(component, width, height)
    const loops = extractBoundaryLoops(mask, width, height, WALL)
      .map(loop => {
        const world = gridLoopToWorld(loop, height, offsetX, offsetZ)
        const simplified = simplifyLoop(world, KEEPOUT_LOOP_SIMPLIFY_M)
        return dedupeLoop(pruneShortSegments(simplified, KEEPOUT_LOOP_MIN_SEGMENT_M))
      })
      .filter(loop => loop.length >= 3 && Math.abs(loopSignedArea(loop)) >= RESOLUTION * RESOLUTION)

    if (loops.length === 0) continue
    loops.sort((a, b) => Math.abs(loopSignedArea(b)) - Math.abs(loopSignedArea(a)))
    const outer = loops[0]
    const instance = componentOrientedBookshelfInstance(component, width, height, offsetX, offsetZ)
    let coordExclude = false
    for (const t of KEEPOUT_BOOKSHELF_WALL_TARGETS) {
      if (!KEEPOUT_EXCLUDE_BOOKSHELF_IDS.has(t.shelfId)) continue
      if (Math.hypot(instance.cx - t.cx, instance.cz - t.cz) <= 0.45) {
        coordExclude = true
        break
      }
    }
    if (coordExclude) continue
    const [x1, z1] = pxToWorld(component.minX, component.minY, height)
    const [x2, z2] = pxToWorld(component.maxX + 1, component.maxY + 1, height)
    const rect = {
      cx: Math.round((((x1 + x2) / 2) - offsetX) * 1000) / 1000,
      cz: Math.round((((z1 + z2) / 2) - offsetZ) * 1000) / 1000,
      w: Math.round(Math.abs(x2 - x1) * 1000) / 1000,
      d: Math.round(Math.abs(z2 - z1) * 1000) / 1000,
    }
    bookshelfPolygons.push(outer)
    bookshelfInstances.push(instance)
    bookshelfRects.push(rect)
    bookshelfComponents.push(component)
  }

  const order = bookshelfInstances.map((v, i) => ({ i, v }))
    .sort((a, b) => (b.v.cz - a.v.cz) || (a.v.cx - b.v.cx))
    .map(v => v.i)

  return {
    source: keepoutImageName,
    components: components.length,
    wallComponents: selectedWallComponents,
    bookshelfPolygons: order.map(i => bookshelfPolygons[i]),
    bookshelfInstances: order.map(i => bookshelfInstances[i]),
    bookshelfRects: order.map(i => bookshelfRects[i]),
    bookshelfComponents: order.map(i => bookshelfComponents[i]),
  }
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

/** offset-world XZ 폴리곤 내부 (비교용 좌표는 gridLoopToWorld와 동일). */
function pointInPolygonXZ(x, z, poly) {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0]
    const zi = poly[i][1]
    const xj = poly[j][0]
    const zj = poly[j][1]
    const denom = zj - zi
    const intersect = ((zi > z) !== (zj > z)) && x < ((xj - xi) * (z - zi)) / (Math.abs(denom) < 1e-14 ? 1e-14 : denom) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * 킵아웃 책장 컴포넌트 원본 셀을 기반으로, 발자국 전체의 WALL/UNKNOWN을 FREE로 비운다.
 * 이어서 복도 전면 방향으로 1~2px 확장 클리어를 수행해 픽셀 경계 잔선을 없앤다.
 */
function clearShelfFootprintAndCorridorApronPixels(
  grid,
  width,
  _height,
  offsetX,
  offsetZ,
  bookshelfInstances,
  bookshelfComponents,
  corridorSamples,
) {
  if (!corridorSamples?.length || !bookshelfInstances?.length || !bookshelfComponents?.length) {
    return {
      totalCleared: 0,
      footprintCleared: 0,
      apronCleared: 0,
      shelfStats: [],
    }
  }
  const MAX_SAMPLE_DIST_M = 5.0
  const APRON_DEPTH_M = Math.max(RESOLUTION * 2.2, 0.12)
  const APRON_SIDE_EXTRA_M = Math.max(RESOLUTION * 1.2, 0.08)
  const MIN_FRONT_M = -0.5 * RESOLUTION
  let footprintCleared = 0
  let apronCleared = 0
  let totalCleared = 0
  const shelfStats = []

  for (let si = 0; si < bookshelfInstances.length; si++) {
    const s = bookshelfInstances[si]
    const comp = bookshelfComponents[si]
    if (!comp || !comp.indices?.length) continue
    const { cx, cz, w, d, yaw } = s
    let shelfFootprintCleared = 0
    for (const idx of comp.indices) {
      if (grid[idx] !== WALL && grid[idx] !== UNKNOWN) continue
      grid[idx] = FREE
      totalCleared++
      footprintCleared++
      shelfFootprintCleared++
    }

    let bestCx = corridorSamples[0].cx
    let bestCz = corridorSamples[0].cz
    let bestD = Infinity
    for (const q of corridorSamples) {
      const dd = Math.hypot(q.cx - cx, q.cz - cz)
      if (dd < bestD) {
        bestD = dd
        bestCx = q.cx
        bestCz = q.cz
      }
    }
    if (bestD > MAX_SAMPLE_DIST_M) {
      shelfStats.push({
        shelfIndex: si,
        nearestCorridorDist: bestD,
        clearedFootprintPx: shelfFootprintCleared,
        clearedApronPx: 0,
        skipped: true,
      })
      continue
    }

    let cdx = bestCx - cx
    let cdz = bestCz - cz
    const cLen = Math.hypot(cdx, cdz)
    if (cLen < 1e-6) {
      shelfStats.push({
        shelfIndex: si,
        nearestCorridorDist: bestD,
        clearedFootprintPx: shelfFootprintCleared,
        clearedApronPx: 0,
        skipped: true,
      })
      continue
    }
    cdx /= cLen
    cdz /= cLen

    const sn = Math.sin(yaw)
    const cs = Math.cos(yaw)
    // yaw 기반 책장 깊이축을 corridor 샘플 방향과 맞춘다.
    let dax = sn
    let daz = cs
    if (dax * cdx + daz * cdz < 0) {
      dax = -sn
      daz = -cs
    }
    const lax = cs
    const laz = -sn
    const maxLat = Math.max(w, d) * 0.5 + APRON_SIDE_EXTRA_M
    const minCol = Math.max(0, comp.minX - 3)
    const maxCol = Math.min(width - 1, comp.maxX + 3)
    const minRow = Math.max(0, comp.minY - 3)
    const maxRow = Math.min(_height - 1, comp.maxY + 3)
    let shelfApronCleared = 0
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const idx = row * width + col
        const cell = grid[idx]
        if (cell !== WALL && cell !== UNKNOWN) continue
        const wx = ORIGIN_X + (col + 0.5) * RESOLUTION
        const wz = ORIGIN_Y + (row + 0.5) * RESOLUTION
        const px = wx - offsetX
        const pz = wz - offsetZ
        const rx = px - cx
        const rz = pz - cz
        const projD = rx * dax + rz * daz
        if (projD < MIN_FRONT_M || projD > APRON_DEPTH_M) continue
        const projL = rx * lax + rz * laz
        if (Math.abs(projL) > maxLat) continue
        grid[idx] = FREE
        totalCleared++
        apronCleared++
        shelfApronCleared++
      }
    }
    shelfStats.push({
      shelfIndex: si,
      nearestCorridorDist: bestD,
      clearedFootprintPx: shelfFootprintCleared,
      clearedApronPx: shelfApronCleared,
      skipped: false,
    })
  }
  return {
    totalCleared,
    footprintCleared,
    apronCleared,
    shelfStats,
  }
}

function countWallSegmentsInsideBookshelfPolygons(wallLoops, shelfPolygons) {
  if (!wallLoops?.length || !shelfPolygons?.length) return 0
  let insideCount = 0
  for (const loop of wallLoops) {
    const n = loop.length
    if (n < 2) continue
    for (let i = 0; i < n; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % n]
      const mx = (a[0] + b[0]) * 0.5
      const mz = (a[1] + b[1]) * 0.5
      let inside = false
      for (const poly of shelfPolygons) {
        if (!poly || poly.length < 3) continue
        if (pointInPolygonXZ(mx, mz, poly)) {
          inside = true
          break
        }
      }
      if (inside) insideCount++
    }
  }
  return insideCount
}

async function main() {
  const deltaArg = process.argv.indexOf('--delta')
  const deltaImageName = deltaArg >= 0 ? process.argv[deltaArg + 1] : null
  const keepoutArg = process.argv.indexOf('--keepout')
  const keepoutImageName = keepoutArg >= 0 ? process.argv[keepoutArg + 1] : null
  const imageArg = process.argv.indexOf('--image')
  const imageOverride = imageArg >= 0 ? process.argv[imageArg + 1] : null
  const mapOffsetOnly = process.argv.includes('--map-offset-only')
  const smoothMap = process.argv.includes('--smooth-map')
  const rawMap = process.argv.includes('--raw-map') || !smoothMap
  PIXEL_MODE = process.argv.includes('--pixel-mode') || rawMap
  const classifyModeArgIdx = process.argv.indexOf('--classify-mode')
  const classifyModeCli =
    classifyModeArgIdx >= 0 ? String(process.argv[classifyModeArgIdx + 1] || '').toLowerCase() : null
  const dumpGridArgIdx = process.argv.indexOf('--dump-classified-pgm')
  const dumpClassifiedRelPath = dumpGridArgIdx >= 0 ? process.argv[dumpGridArgIdx + 1] : null

  const config = parseYamlMapConfig(YAML_PATH)
  RESOLUTION = config.resolution
  ORIGIN_X = config.originX
  ORIGIN_Y = config.originY
  const configImageName = imageOverride ?? config.imageName
  const imagePath = resolve(ROOT, configImageName)
  const imageExt = extname(configImageName).toLowerCase()
  const isPgm = imageExt === '.pgm' || imageExt === '.pnm'
  const { wallThreshold, freeThreshold } = thresholdsFromYaml(config.occupiedThresh, config.freeThresh)

  console.log(`Reading map image: ${imagePath}`)
  const raster = isPgm
    ? null
    : await parseRasterImage(imagePath, config.negate)
  let width
  let height
  let pixels
  if (isPgm) {
    const pgm = parsePGM(imagePath)
    width = pgm.width
    height = pgm.height
    pixels = pgm.pixels
    applyNegateInPlaceUint8(pixels, pgm.maxval, config.negate)
    if (config.negate === 1) console.log(`  YAML negate: 1 applied to PGM (maxval ${pgm.maxval})`)
  } else {
    width = raster.width
    height = raster.height
    pixels = raster.pixels
  }
  let classifyMode = isPgm ? config.mode : 'scale'
  if (isPgm && classifyModeCli) {
    if (classifyModeCli !== 'trinary' && classifyModeCli !== 'scale') {
      throw new Error(`--classify-mode must be trinary or scale, got ${classifyModeCli}`)
    }
    classifyMode = classifyModeCli
  }
  if (rawMap) {
    console.log('  raw-minimal mode: enabled (default). pass --smooth-map for full smoothing pipeline.')
  }
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

  if (rawMap) {
    console.log('  --raw-map: skipped wall noise removal and morphClose')
  } else {
    console.log('Removing wall noise while preserving pillar-like components...')
    const firstCleanup = removeWallNoisePreservingPillars(grid, width, height)
    console.log(`  removed: ${firstCleanup.removed}, pillar-like kept: ${firstCleanup.pillarLike}`)

    grid = morphClose(grid, width, height)
    const secondCleanup = removeWallNoisePreservingPillars(grid, width, height)
    console.log(`  post-close removed: ${secondCleanup.removed}, pillar-like kept: ${secondCleanup.pillarLike}`)
  }

  const enclosedResolve = resolveEnclosedRegions(grid, width, height)
  const freeSelection = keepSignificantFreeComponents(grid, width, height)
  console.log(
    `  enclosed regions: ${enclosedResolve.enclosedCount}, free-assigned: ${enclosedResolve.freeAssigned}, wall-assigned: ${enclosedResolve.wallAssigned}, unknown-assigned: ${enclosedResolve.unknownAssigned}, largest-enclosed: ${enclosedResolve.largestEnclosedSize}, kept free: ${freeSelection.totalKeptSize} (${freeSelection.keptCount} components), interior-priority: ${freeSelection.usedInterior}, candidates: ${freeSelection.candidateCount}`,
  )
  let wallFilter = { kept: 0, removed: 0 }
  if (rawMap) {
    console.log('  --raw-map: skipped pruneWallsNotAdjacentToFree')
  } else {
    wallFilter = pruneWallsNotAdjacentToFree(grid, width, height)
    console.log(`  wall components kept near interior: ${wallFilter.kept}, wall pixels removed: ${wallFilter.removed}`)
  }

  if (dumpClassifiedRelPath) {
    const dumpAbs = resolve(ROOT, dumpClassifiedRelPath)
    writeClassifiedGridPGM(dumpAbs, grid, width, height)
    console.log(`  wrote classified grid PGM: ${dumpClassifiedRelPath}`)
  }

  let rawFloorRects = greedyMesh(grid, width, height, FREE)
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
  let offsetX = totalArea > 0 ? sumX / totalArea : 0
  let offsetZ = totalArea > 0 ? sumZ / totalArea : 0
  console.log(`  center offset (pre-forced): (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)

  const forcedUnknown = forceUnknownForIsolatedAreas(
    grid,
    width,
    height,
    offsetX,
    offsetZ,
    FORCED_UNKNOWN_ISOLATED_AREAS,
  )
  console.log(
    `  forced unknown isolated areas: candidates=${forcedUnknown.candidateComponentCount}, components=${forcedUnknown.targetedComponentCount}, pixels=${forcedUnknown.changedPixels}`,
  )
  for (const match of forcedUnknown.areaMatches) {
    const labelText = match.label === 0 ? 'none' : String(match.label)
    const distText = Number.isFinite(match.distance) ? match.distance.toFixed(3) : 'n/a'
    const sizeText = match.size > 0 ? String(match.size) : 'n/a'
    console.log(
      `    ${match.area.surface} circle @(${match.area.cx.toFixed(3)}, ${match.area.cz.toFixed(3)}) r=${match.area.radius.toFixed(3)} -> component=${labelText}, nearestDist=${distText}, size=${sizeText}, reason=${match.reason}`,
    )
  }

  rawFloorRects = greedyMesh(grid, width, height, FREE)
  sumX = 0
  sumZ = 0
  totalArea = 0
  for (const r of rawFloorRects) {
    const [x1, z1] = pxToWorld(r.x, r.y, height)
    const [x2, z2] = pxToWorld(r.x + r.w, r.y + r.h, height)
    const area = Math.abs(x2 - x1) * Math.abs(z2 - z1)
    sumX += ((x1 + x2) / 2) * area
    sumZ += ((z1 + z2) / 2) * area
    totalArea += area
  }
  offsetX = totalArea > 0 ? sumX / totalArea : 0
  offsetZ = totalArea > 0 ? sumZ / totalArea : 0
  console.log(`  center offset (final): (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)

  const pillarCarvePx = carveWallToFreeInCircles(
    grid,
    width,
    height,
    offsetX,
    offsetZ,
    PILLAR_DELETE_OPEN_AREAS,
  )
  if (pillarCarvePx > 0) {
    console.log(`  pillar delete open areas: ${pillarCarvePx} wall pixels -> FREE`)
    rawFloorRects = greedyMesh(grid, width, height, FREE)
    sumX = 0
    sumZ = 0
    totalArea = 0
    for (const r of rawFloorRects) {
      const [x1, z1] = pxToWorld(r.x, r.y, height)
      const [x2, z2] = pxToWorld(r.x + r.w, r.y + r.h, height)
      const area = Math.abs(x2 - x1) * Math.abs(z2 - z1)
      sumX += ((x1 + x2) / 2) * area
      sumZ += ((z1 + z2) / 2) * area
      totalArea += area
    }
    offsetX = totalArea > 0 ? sumX / totalArea : 0
    offsetZ = totalArea > 0 ? sumZ / totalArea : 0
    console.log(`  center offset (after pillar carve): (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)
  }

  if (mapOffsetOnly) {
    console.log(
      JSON.stringify({
        offsetX,
        offsetZ,
        width,
        height,
        originX: ORIGIN_X,
        originZ: ORIGIN_Y,
        resolution: RESOLUTION,
        image: configImageName,
      }),
    )
    process.exit(0)
  }

  const deltaShelfRectsFromDiff = []
  const deltaShelfComponentsFromDiff = []
  const deltaWallComponentsForBase = []
  let gridChangedAfterFloorMesh = false
  let keepoutExtraction = null
  /** PGM/occupancy만 반영한 그리드. keepout·delta 벽 합류 후 생기는 작은 덩어리가 기둥으로 오인되지 않게 기둥 후보는 이 스냅샷에서만 추출한다. */
  const gridForPillarExtraction = new Uint8Array(grid)
  if (deltaImageName) {
    console.log(`\nDelta mode: classifying added components from ${deltaImageName}`)
    const deltaPath = resolve(ROOT, deltaImageName)
    const deltaExt = extname(deltaImageName).toLowerCase()
    const deltaIsPgm = deltaExt === '.pgm' || deltaExt === '.pnm'
    let dw
    let dh
    let deltaPixels
    let deltaBackground = null
    if (deltaIsPgm) {
      const pgm = parsePGM(deltaPath)
      dw = pgm.width
      dh = pgm.height
      deltaPixels = pgm.pixels
      applyNegateInPlaceUint8(deltaPixels, pgm.maxval, config.negate)
    } else {
      const deltaRaster = await parseRasterImage(deltaPath, config.negate)
      dw = deltaRaster.width
      dh = deltaRaster.height
      deltaPixels = deltaRaster.pixels
      deltaBackground = deltaRaster.backgroundValue
    }
    if (dw !== width || dh !== height) {
      throw new Error(`Delta image size must match base map size: delta=${dw}x${dh}, base=${width}x${height}`)
    }

    let deltaGrid = deltaIsPgm
      ? classify(deltaPixels, wallThreshold, freeThreshold, classifyMode)
      : classifyRaster(deltaPixels, wallThreshold, Math.max(freeThreshold, 245), deltaBackground, 30)
    if (rawMap) {
      console.log('  delta raw-minimal: skipped wall noise removal and morphClose')
    } else {
      removeWallNoisePreservingPillars(deltaGrid, dw, dh)
      deltaGrid = morphClose(deltaGrid, dw, dh)
      removeWallNoisePreservingPillars(deltaGrid, dw, dh)
    }

    const deltaWallGrid = new Uint8Array(dw * dh)
    let deltaCount = 0
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const di = y * dw + x
        if (deltaGrid[di] !== WALL) continue
        const baseIsWall = grid[y * width + x] === WALL
        if (!baseIsWall) {
          deltaWallGrid[di] = WALL
          deltaCount++
        }
      }
    }
    console.log(`  delta image: ${dw}x${dh}, base: ${width}x${height}`)
    console.log(`  delta wall pixels: ${deltaCount}`)

    const baseWorldMinX = ORIGIN_X - offsetX
    const baseWorldMaxX = ORIGIN_X + (width - 1) * RESOLUTION - offsetX
    const baseWorldMinZ = ORIGIN_Y - offsetZ
    const baseWorldMaxZ = ORIGIN_Y + (height - 1) * RESOLUTION - offsetZ

    const deltaForComponents = rawMap ? deltaWallGrid : morphClose(deltaWallGrid, dw, dh)
    const { components: deltaComponents } = extractComponents(deltaForComponents, dw, dh, WALL)
    const selectedDeltaWalls = selectDeltaWallComponentsNearAreas(
      deltaComponents,
      dw,
      dh,
      offsetX,
      offsetZ,
      DELTA_TARGET_WALL_AREAS,
    )
    for (const sel of selectedDeltaWalls) {
      deltaWallComponentsForBase.push(sel.component)
      console.log(
        `  delta target wall: center=(${sel.area.cx.toFixed(3)}, ${sel.area.cz.toFixed(3)}), label=${sel.component.label}, dist=${sel.distance.toFixed(3)}, size=${sel.component.size}`,
      )
    }
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
        deltaShelfRectsFromDiff.push({
          cx: Math.round(cx * 1000) / 1000,
          cz: Math.round(cz * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          d: Math.round(d * 1000) / 1000,
        })
        deltaShelfComponentsFromDiff.push(c)
      }
    }
    console.log(`  delta components: ${deltaComponents.length}, shelf candidates: ${deltaShelfRectsFromDiff.length}`)
    console.log(`  delta selected walls for base: ${deltaWallComponentsForBase.length}`)
    deltaShelfRectsFromDiff.forEach((r, i) => console.log(`    shelf ${i}: cx=${r.cx} cz=${r.cz} w=${r.w} d=${r.d}`))
    console.log('  delta wall-like components are ignored for base mapData except explicitly selected target walls')
  }

  if (deltaWallComponentsForBase.length > 0) {
    for (const c of deltaWallComponentsForBase) {
      for (const idx of c.indices) grid[idx] = WALL
    }
    gridChangedAfterFloorMesh = true
    const backspaceUnknown = markBlockedBackspaceUnknownNearAreas(
      grid,
      width,
      height,
      offsetX,
      offsetZ,
      DELTA_TARGET_WALL_AREAS,
    )
    console.log(`  backspace unknown by new walls: ${backspaceUnknown.totalChanged}`)
    for (const item of backspaceUnknown.changedByArea) {
      console.log(
        `    area @(${item.area.cx.toFixed(3)}, ${item.area.cz.toFixed(3)}) changed=${item.changed}, reason=${item.reason}`,
      )
    }
  }

  if (keepoutImageName) {
    console.log(`\nKeepout mode: extracting bookshelf footprints from ${keepoutImageName}`)
    keepoutExtraction = extractKeepoutBookshelves(
      keepoutImageName,
      width,
      height,
      offsetX,
      offsetZ,
      KEEPOUT_BOOKSHELF_WALL_TARGETS,
    )
    if (keepoutExtraction.wallComponents.length > 0) {
      for (const sel of keepoutExtraction.wallComponents) {
        for (const idx of sel.component.indices) grid[idx] = WALL
        console.log(
          `  keepout bookshelf promoted to wall: ${sel.area.shelfId ?? 'unknown'} center=(${sel.area.cx.toFixed(3)}, ${sel.area.cz.toFixed(3)}), label=${sel.component.label}, dist=${sel.distance.toFixed(3)}, size=${sel.component.size}`,
        )
      }
      gridChangedAfterFloorMesh = true
      const backspaceUnknown = markBlockedBackspaceUnknownNearAreas(
        grid,
        width,
        height,
        offsetX,
        offsetZ,
        KEEPOUT_BACKSPACE_UNKNOWN_AREAS,
      )
      console.log(`  keepout backspace unknown by promoted walls: ${backspaceUnknown.totalChanged}`)
      for (const item of backspaceUnknown.changedByArea) {
        console.log(
          `    area @(${item.area.cx.toFixed(3)}, ${item.area.cz.toFixed(3)}) changed=${item.changed}, reason=${item.reason}`,
        )
      }
    }
  }

  if (keepoutExtraction && keepoutExtraction.bookshelfInstances.length > 0) {
    const clearedShelfWalls = clearShelfFootprintAndCorridorApronPixels(
      grid,
      width,
      height,
      offsetX,
      offsetZ,
      keepoutExtraction.bookshelfInstances,
      keepoutExtraction.bookshelfComponents,
      CORRIDOR_CIRCLE_AREAS,
    )
    if (clearedShelfWalls.totalCleared > 0) {
      gridChangedAfterFloorMesh = true
      console.log(
        `  corridor shelf clear: total=${clearedShelfWalls.totalCleared}, footprint=${clearedShelfWalls.footprintCleared}, apron=${clearedShelfWalls.apronCleared}`,
      )
      for (const stat of clearedShelfWalls.shelfStats) {
        const distText = Number.isFinite(stat.nearestCorridorDist) ? stat.nearestCorridorDist.toFixed(3) : 'n/a'
        console.log(
          `    shelf[${stat.shelfIndex}] nearestCorridorDist=${distText}, footprint=${stat.clearedFootprintPx}, apron=${stat.clearedApronPx}, skipped=${stat.skipped}`,
        )
      }
    }
  }

  if (gridChangedAfterFloorMesh) {
    rawFloorRects = greedyMesh(grid, width, height, FREE)
  }

  const rawLoops = extractFreeBoundaryLoops(gridForPillarExtraction, width, height)
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

  const wallExtract = extractComponents(gridForPillarExtraction, width, height, WALL)
  const { components: wallComponents } = wallExtract
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
    const aspect = longSide / Math.max(0.001, smallSide)
    const center = [cx, cz]
    const outerDistance = outerLoop.length > 0 ? nearestDistanceToLoop(center, outerLoop) : Infinity
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
      c.size >= 6 &&
      c.size <= 90 &&
      smallSide >= 0.03 &&
      smallSide <= 0.6 &&
      longSide <= 0.7 &&
      aspect <= 1.9 &&
      c.fillRatio >= 0.1
    )
    const pillarLike = pillar || tinyPillar
    const forcePgmWall = PILLAR_FORCE_WALL_CIRCLE_AREAS.some(
      a => Math.hypot(cx - a.cx, cz - a.cz) <= a.radius,
    )
    if (pillarLike && !forcePgmWall) {
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
  }

  const PILLAR_DIAMETER = 0.2
  /** 같은 기둥의 잔여 픽셀(satellite)을 흡수하기 위한 NMS 반경. 영역별로 가장 큰 후보 1개만 채택. */
  const PILLAR_NMS_RADIUS_M = 1.0

  pillarCandidateRects.sort((a, b) => b.size - a.size)
  const bestCluster = []
  for (const c of pillarCandidateRects) {
    const tooClose = bestCluster.some(s =>
      Math.hypot(s.rect.cx - c.rect.cx, s.rect.cz - c.rect.cz) < PILLAR_NMS_RADIUS_M,
    )
    if (!tooClose) bestCluster.push(c)
  }

  const pillarRects = bestCluster.map(v => ({
    cx: v.rect.cx,
    cz: v.rect.cz,
    w: PILLAR_DIAMETER,
    d: PILLAR_DIAMETER,
  }))
  console.log(`  pillar candidates: ${pillarCandidateRects.length}, selected: ${bestCluster.length} (NMS radius ${PILLAR_NMS_RADIUS_M}m)`)
  bestCluster.forEach((v, i) => console.log(`    pillar ${i}: cx=${v.rect.cx} cz=${v.rect.cz} size=${v.size}`))

  /** 최종 grid(keepout 책장 벽 포함)와 스냅샷 기둥 bbox 라벨이 어긋나므로, offset-world 박스로만 기둥 픽셀을 판별한다. */
  const pillarFootprintHalf = v => ({
    hw: v.rect.w * 0.5 + RESOLUTION * 0.25,
    hd: v.rect.d * 0.5 + RESOLUTION * 0.25,
  })
  const pixelCenterInPillarFootprint = (col, row) => {
    const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, height)
    const ox = wx - offsetX, oz = wz - offsetZ
    for (const v of bestCluster) {
      const { hw, hd } = pillarFootprintHalf(v)
      if (Math.abs(ox - v.rect.cx) <= hw && Math.abs(oz - v.rect.cz) <= hd) return true
    }
    return false
  }

  const wallGrid = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL) continue
    const col = i % width
    const row = (i - col) / width
    if (pixelCenterInPillarFootprint(col, row)) continue
    wallGrid[i] = WALL
  }

  const rawWallRects = greedyMesh(wallGrid, width, height, WALL)
  const wallRects = pixelRectsToWorld(rawWallRects, height, offsetX, offsetZ)
  const renderBoundaryGrid = new Uint8Array(grid)
  for (let i = 0; i < renderBoundaryGrid.length; i++) {
    if (grid[i] !== WALL) continue
    const col = i % width
    const row = (i - col) / width
    if (pixelCenterInPillarFootprint(col, row)) renderBoundaryGrid[i] = FREE
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== WALL) continue
    const col = i % width
    const row = (i - col) / width
    if (!pixelCenterInPillarFootprint(col, row)) continue
    const px = col
    const py = row
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
  if (keepoutExtraction?.bookshelfPolygons?.length) {
    const insideShelfWallSegments = countWallSegmentsInsideBookshelfPolygons(
      wallPolylines,
      keepoutExtraction.bookshelfPolygons,
    )
    console.log(`  shelf overlap diagnostic: insideShelfWallSegments=${insideShelfWallSegments}`)
  }
  const fallbackPolylines = wallPolylines.length > 0 ? wallPolylines : centerLoops
  const principalAxes = computePrincipalAxes(fallbackPolylines)
  console.log(`  principal axes: [${principalAxes.map(a => a.toFixed(4)).join(', ')}]`)

  // Base mapData remains wall-centric unless a keepout mask explicitly provides bookshelf footprints.
  let finalBookshelfRects = []
  let finalBookshelfInstances = []
  let finalBookshelfPolygons = []
  let keepoutSourceLabel = null
  if (keepoutImageName) {
    const keepout = keepoutExtraction ?? extractKeepoutBookshelves(keepoutImageName, width, height, offsetX, offsetZ)
    finalBookshelfRects = keepout.bookshelfRects
    finalBookshelfInstances = keepout.bookshelfInstances
    finalBookshelfPolygons = keepout.bookshelfPolygons
    keepoutSourceLabel = keepout.source
    console.log(`  keepout components: ${keepout.components}, bookshelf footprints: ${finalBookshelfPolygons.length}, promoted walls: ${keepout.wallComponents.length}`)
  }
  const deltaShelfLayerInstances = deltaShelfRectsFromDiff.map((r, i) => {
    const comp = deltaShelfComponentsFromDiff[i]
    const obb = componentOrientedBBox(comp, width)
    const longSide = Math.max(obb.w, obb.d)
    const shortSide = Math.min(obb.w, obb.d)
    const rawAngle = obb.w >= obb.d ? obb.angle : obb.angle + Math.PI / 2
    const nearest = nearestSegmentAngle([r.cx, r.cz], fallbackPolylines)
    const wallAxis = snapYawToNearestAxis(nearest.angle, principalAxes)
    const wallCandidates = [wallAxis, wallAxis + Math.PI / 2, wallAxis - Math.PI / 2, wallAxis + Math.PI]
    const snappedYaw = snapYawToNearestAxis(rawAngle, wallCandidates)
    return {
      kind: 'bookshelf',
      cx: r.cx,
      cz: r.cz,
      w: Math.round(longSide * 1000) / 1000,
      d: Math.round(shortSide * 1000) / 1000,
      yaw: Math.round(snappedYaw * 10000) / 10000,
      h: 2.34,
    }
  })

  if (deltaImageName && !keepoutImageName) {
    // Keep base mapData layer fixed (wall/floor centric) in delta mode as well.
    finalBookshelfRects = []
    finalBookshelfInstances = []
    finalBookshelfPolygons = []
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

  const baseSourceLabel = keepoutSourceLabel ? `${config.imageName} + keepout ${keepoutSourceLabel}` : config.imageName
  const deltaSourceLabel = deltaImageName ? `${config.imageName} + delta ${deltaImageName}` : config.imageName
  const ts = `// Auto-generated from ${baseSourceLabel} — do not edit manually.
// Run: node scripts/processMap.mjs${keepoutImageName ? ' --keepout ' + keepoutImageName : ''}

export type WallRect = { cx: number; cz: number; w: number; d: number }
export type BookshelfInstance = { cx: number; cz: number; w: number; d: number; yaw: number }
export type Point2 = [number, number]

export const MAP_RESOLUTION = ${RESOLUTION}
export const mapWidth = ${mapWidth}
export const mapDepth = ${mapDepth}
/** YAML origin; 3D geometry uses pxToWorld minus mapImageOffset. */
export const MAP_IMAGE_ORIGIN_X = ${ORIGIN_X}
export const MAP_IMAGE_ORIGIN_Z = ${ORIGIN_Y}
export const MAP_IMAGE_WIDTH_PX = ${width}
export const MAP_IMAGE_HEIGHT_PX = ${height}
/** Area-weighted centroid of floor rects in world (pxToWorld); subtracted in mapData coords. */
export const mapImageOffsetX = ${Math.round(offsetX * 10000) / 10000}
export const mapImageOffsetZ = ${Math.round(offsetZ * 10000) / 10000}

export const wallRects: WallRect[] = ${JSON.stringify(wallRects)}
export const bookshelfRects: WallRect[] = ${JSON.stringify(finalBookshelfRects)}
export const bookshelfInstances: BookshelfInstance[] = ${JSON.stringify(finalBookshelfInstances)}
export const bookshelfPolygons: Point2[][] = ${JSON.stringify(finalBookshelfPolygons)}
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

  const deltaOutPath = resolve(ROOT, 'src', 'data', 'deltaShelfLayer.ts')
  const deltaTs = `// Auto-generated from ${deltaSourceLabel} (delta shelf layer) — do not edit manually.
// Run: node scripts/processMap.mjs${deltaImageName ? ' --delta ' + deltaImageName : ''}

export type DeltaShelfInstance = {
  kind: 'bookshelf'
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
}

export const deltaShelfLayerSource = ${JSON.stringify(deltaImageName ?? null)}
export const deltaShelfLayerInstances: DeltaShelfInstance[] = ${JSON.stringify(deltaShelfLayerInstances)}
`
  writeFileSync(deltaOutPath, deltaTs, 'utf-8')
  console.log(`Wrote ${deltaOutPath}`)
  console.log(`  deltaShelfLayerInstances: ${deltaShelfLayerInstances.length}`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
