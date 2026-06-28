import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { relocateInterAisleWallsBehindShelves } from './aisleWallRelocateCore.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const WALL = 1
const FREE = 2
const UNKNOWN = 0

const DEFAULT_IMAGE = 'KakaoTalk_20260329_205358459.pgm'
const YAML_PATH = resolve(ROOT, 'map_info', 'b2floor_edited.yaml')
const DEFAULT_FRAME_IMAGE = 'map_info/map_masked.pgm'
const DEFAULT_STRUCTURE_IMAGE = 'map_info/b2floor_edited.pgm'
const DEFAULT_KEEPOUT_IMAGE = 'map_info/keepout_mask.pgm'

const MIN_CLUSTER_SIZE = 28
/** Looser snap reduces stair-stepping along diagonals vs strict Manhattan alignment. */
const AXIS_SNAP_DEG = 13
const CENTER_LOOP_SIMPLIFY_M = 0.2
const RENDER_LOOP_SIMPLIFY_M = 0.32
const HOLE_LOOP_SIMPLIFY_M = 0.1
const KEEPOUT_LOOP_SIMPLIFY_M = 0.06
const CENTER_LOOP_MIN_SEGMENT_M = 0.16
const RENDER_LOOP_MIN_SEGMENT_M = 0.2
const HOLE_LOOP_MIN_SEGMENT_M = 0.1
const KEEPOUT_LOOP_MIN_SEGMENT_M = 0.05

const SOURCE_PATCH_APP_OFFSET_X = -26.7864
const SOURCE_PATCH_APP_OFFSET_Z = 4.8291
const SOURCE_OCCLUSION_PATCHES = [
  {
    label: 'north service pocket',
    center: { x: -5.491, z: 4.628 },
    clearRadiusM: 0.75,
    wallifyRadiusM: 1.85,
  },
  {
    label: 'west service pocket',
    center: { x: -14.899, z: -0.645 },
    clearRadiusM: 0.9,
    wallifyRadiusM: 2.15,
  },
]

const MANUAL_KEEP_OUT_BOOKSHELF_OVERRIDES = [
  {
    label: 'west wall shelf from map_masked',
    center: { x: -18.113, z: -2.627 },
    w: 2.35,
    d: 0.55,
    yaw: 1.9417,
    replaceRadiusM: 0.8,
    clearStructure: true,
  },
]

const MANUAL_L_CORNER_BOOKSHELF_GROUPS = [
  {
    label: 'south room NE corner',
    corner: { x: 4.099, z: -13.402 },
    armLengthM: 1.8,
    armDepthM: 0.55,
    primaryYaw: 1.8925,
    replaceRadiusM: 2.3,
    missingSx: -1,
    missingSz: -1,
  },
  {
    label: 'south room SW corner',
    corner: { x: 2.182, z: -19.261 },
    armLengthM: 1.8,
    armDepthM: 0.55,
    primaryYaw: 0.3016,
    replaceRadiusM: 2.1,
    missingSx: 1,
    missingSz: 1,
  },
]

const FORCE_RECTANGULAR_BOOKSHELF_OVERRIDES = [
  { label: 'south room square shelf west', center: { x: -7.345, z: -9.948 }, radiusM: 0.45 },
  { label: 'south room square shelf north-east', center: { x: -9.895, z: -12.048 }, radiusM: 0.45 },
  { label: 'south room square shelf south-east', center: { x: -6.895, z: -13.148 }, radiusM: 0.45 },
]

const STRAIGHTEN_WALL_BACK_OFFSET_M = 0.08
const STRAIGHTEN_WALL_CLEAR_MARGIN_M = 0.18
const STRAIGHTEN_WALL_EXTEND_M = 0.24
const STRAIGHTEN_WALL_THICKNESS_M = 0.08

const MANUAL_POLYLINE_STRAIGHTENING = [
  { label: 'south room east diagonal wall', loopIndex: 0, start: [1.625, -18.954], end: [3.95, -12.079] },
  { label: 'west wall protrusion shelf wall committed loop', loopIndex: 0, start: [-22.35, -10.329], end: [-18.15, 0.571], startOverride: [-22.56, -10.329] },
  { label: 'west wall protrusion shelf wall', loopIndex: 0, start: [-23.147, -11.13], end: [-17.597, -1.03], startOverride: [-23.35, -11.13] },
  { label: 'inner west room wall', loopIndex: 1, start: [-12.575, 15.596], end: [-15.65, 7.271] },
  { label: 'north west outer wall', loopIndex: 0, start: [-0.625, 14.046], end: [-13.675, 18.746] },
  { label: 'east corridor upper wall', loopIndex: 0, start: [42.125, -3.854], end: [9.675, 9.746] },
  { label: 'east corridor lower wall', loopIndex: 0, start: [13.375, 5.196], end: [43.875, -8.054], startOverride: [13.375, 5.096], endOverride: [43.875, -8.4] },
  { label: 'west room bend wall committed loop', loopIndex: 0, start: [-20.5, 1.021], end: [-24.4, -9.679], endOverride: [-24.62, -9.679] },
  { label: 'west room bend wall', loopIndex: 0, start: [-18.647, 0.47], end: [-23.35, -11.13] },
]

const MANUAL_PHOTO_BOOKSHELF_ADDITIONS = [
  {
    label: 'west wall protrusion bookshelf',
    cx: -19.661,
    cz: -1.346,
    w: 3.6,
    d: 0.65,
    yaw: -1.2408,
    h: 2.34,
  },
]

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
  const imageName = (data.image || '').trim().replace(/^["']|["']$/g, '') || DEFAULT_IMAGE
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

function writePGM(filepath, pgm) {
  const header = `P5\n${pgm.width} ${pgm.height}\n${pgm.maxval ?? 255}\n`
  const bytes = Buffer.alloc(Buffer.byteLength(header) + pgm.pixels.length)
  bytes.write(header, 0, 'ascii')
  Buffer.from(pgm.pixels).copy(bytes, Buffer.byteLength(header))
  writeFileSync(filepath, bytes)
}

function appWorldToSourcePixel(x, z, height) {
  const wx = x + SOURCE_PATCH_APP_OFFSET_X
  const wz = z + SOURCE_PATCH_APP_OFFSET_Z
  return {
    col: Math.round((wx - ORIGIN_X) / RESOLUTION),
    row: Math.round(height - 1 - ((wz - ORIGIN_Y) / RESOLUTION)),
  }
}

function sourcePixelDistanceToRect(col, row, c) {
  const dx = Math.max(c.minX - col, 0, col - c.maxX)
  const dy = Math.max(c.minY - row, 0, row - c.maxY)
  return Math.hypot(dx, dy)
}

function assertSamePgmSize(a, b, labelA, labelB) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`${labelA} ${a.width}x${a.height} must match ${labelB} ${b.width}x${b.height}`)
  }
}

function applySourceOcclusionPatchesToPgms(structurePgm, framePgm, keepoutPgm) {
  assertSamePgmSize(structurePgm, framePgm, 'structure', 'frame')
  assertSamePgmSize(structurePgm, keepoutPgm, 'structure', 'keepout')

  const width = structurePgm.width
  const height = structurePgm.height
  const wallThreshold = 89
  const wallValue = 0
  const unknownValue = 205
  const keepoutFreeValue = 255
  let totalWallified = 0
  let totalClearedFloor = 0

  const keepoutClass = new Uint8Array(keepoutPgm.pixels.length)
  for (let i = 0; i < keepoutPgm.pixels.length; i++) {
    if (keepoutPgm.pixels[i] <= wallThreshold) keepoutClass[i] = WALL
  }
  const { components: keepoutComponents } = extractComponents(keepoutClass, width, height, WALL)

  for (const patch of SOURCE_OCCLUSION_PATCHES) {
    const { col, row } = appWorldToSourcePixel(patch.center.x, patch.center.z, height)
    const clearRadiusPx = Math.max(1, Math.round(patch.clearRadiusM / RESOLUTION))
    const wallifyRadiusPx = Math.max(clearRadiusPx, Math.round(patch.wallifyRadiusM / RESOLUTION))
    const selectedComponents = keepoutComponents.filter(
      c => !c.touchesBoundary && sourcePixelDistanceToRect(col, row, c) <= wallifyRadiusPx,
    )

    const blocked = new Uint8Array(width * height)
    for (let i = 0; i < blocked.length; i++) {
      if (
        structurePgm.pixels[i] <= wallThreshold ||
        framePgm.pixels[i] <= wallThreshold ||
        keepoutPgm.pixels[i] <= wallThreshold
      ) {
        blocked[i] = 1
      }
    }

    const queue = []
    const visited = new Uint8Array(width * height)
    const seedIdx = row * width + col
    if (col >= 0 && col < width && row >= 0 && row < height && !blocked[seedIdx]) {
      visited[seedIdx] = 1
      queue.push(seedIdx)
    }
    let clearedFloor = 0
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi]
      const x = idx % width
      const y = (idx - x) / width
      const dx = x - col
      const dy = y - row
      if (Math.hypot(dx, dy) > clearRadiusPx) continue
      if (structurePgm.pixels[idx] >= 250 || framePgm.pixels[idx] >= 250) {
        structurePgm.pixels[idx] = unknownValue
        framePgm.pixels[idx] = unknownValue
        clearedFloor++
      }
      const neighbors = [idx - 1, idx + 1, idx - width, idx + width]
      for (const ni of neighbors) {
        if (ni < 0 || ni >= visited.length || visited[ni] || blocked[ni]) continue
        const nx = ni % width
        const ny = (ni - nx) / width
        if (Math.abs(nx - col) > clearRadiusPx || Math.abs(ny - row) > clearRadiusPx) continue
        visited[ni] = 1
        queue.push(ni)
      }
    }

    let wallified = 0
    for (const component of selectedComponents) {
      for (const idx of component.indices) {
        structurePgm.pixels[idx] = wallValue
        framePgm.pixels[idx] = wallValue
        keepoutPgm.pixels[idx] = keepoutFreeValue
        wallified++
      }
    }

    // Add a small solid cap at the selected floor area so the deleted pocket is visibly sealed.
    for (let y = Math.max(0, row - 2); y <= Math.min(height - 1, row + 2); y++) {
      for (let x = Math.max(0, col - 2); x <= Math.min(width - 1, col + 2); x++) {
        const idx = y * width + x
        structurePgm.pixels[idx] = wallValue
        framePgm.pixels[idx] = wallValue
      }
    }

    totalWallified += wallified
    totalClearedFloor += clearedFloor
    console.log(
      `  source patch ${patch.label}: seed=(${col},${row}), wallified=${wallified}, cleared-floor=${clearedFloor}`,
    )
  }

  // Normalize keepout background in patched files.
  for (let i = 0; i < keepoutPgm.pixels.length; i++) {
    if (keepoutPgm.pixels[i] > wallThreshold) keepoutPgm.pixels[i] = keepoutFreeValue
  }

  return { wallified: totalWallified, clearedFloor: totalClearedFloor }
}

function writePatchedSourcePgms(structureImageName, frameImageName, keepoutImageName) {
  const structurePath = resolve(ROOT, structureImageName)
  const framePath = resolve(ROOT, frameImageName)
  const keepoutPath = resolve(ROOT, keepoutImageName)
  const structurePgm = parsePGM(structurePath)
  const framePgm = parsePGM(framePath)
  const keepoutPgm = parsePGM(keepoutPath)
  const stats = applySourceOcclusionPatchesToPgms(structurePgm, framePgm, keepoutPgm)
  writePGM(structurePath, structurePgm)
  writePGM(framePath, framePgm)
  writePGM(keepoutPath, keepoutPgm)
  console.log(
    `Wrote source PGM patches: wallified=${stats.wallified}, cleared-floor=${stats.clearedFloor}`,
  )
}

async function parseRasterImage(filepath, negate = 0, resizeTo = null) {
  const { default: sharp } = await import('sharp')
  let pipeline = sharp(filepath).greyscale()
  if (resizeTo) {
    pipeline = pipeline.resize({
      width: resizeTo.width,
      height: resizeTo.height,
      fit: 'fill',
      kernel: 'nearest',
    })
  }
  const { data, info } = await pipeline
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

async function readClassifiedImage(imageName, config, wallThreshold, freeThreshold, options = {}) {
  const imagePath = resolve(ROOT, imageName)
  const imageExt = extname(imageName).toLowerCase()
  const isPgm = imageExt === '.pgm' || imageExt === '.pnm'
  const raster = isPgm
    ? null
    : await parseRasterImage(imagePath, config.negate, options.resizeTo ?? null)
  const { width, height, pixels } = isPgm
    ? parsePGM(imagePath)
    : raster
  const classifyMode = isPgm ? config.mode : 'scale'
  const grid = isPgm
    ? classify(pixels, wallThreshold, freeThreshold, classifyMode)
    : classifyRaster(
      pixels,
      wallThreshold,
      Math.max(freeThreshold, 245),
      raster.backgroundValue,
      30,
    )

  return {
    imageName,
    imagePath,
    isPgm,
    raster,
    width,
    height,
    pixels,
    classifyMode,
    grid,
  }
}

async function buildProcessedGrid(imageName, config, wallThreshold, freeThreshold, label, keepoutGrid = null, options = {}) {
  const loaded = await readClassifiedImage(imageName, config, wallThreshold, freeThreshold, options)
  const { grid, width, height } = loaded
  console.log(`Reading ${label}: ${loaded.imagePath}`)
  console.log(`  Dimensions: ${width}x${height}, resolution: ${RESOLUTION}`)
  console.log(`  mode: ${loaded.classifyMode}, thresholds -> wall <= ${wallThreshold}, free >= ${freeThreshold}`)
  if (!loaded.isPgm) {
    console.log(`  raster background(gray): ${loaded.raster.backgroundValue}, raster free cutoff: ${Math.max(freeThreshold, 245)}`)
    if (options.resizeTo) {
      console.log(`  raster resized in memory to: ${options.resizeTo.width}x${options.resizeTo.height}`)
    }
  }

  if (keepoutGrid) {
    if (keepoutGrid.width !== width || keepoutGrid.height !== height) {
      throw new Error(`Keepout image ${keepoutGrid.width}x${keepoutGrid.height} must match ${label} ${width}x${height}`)
    }
    let cleared = 0
    for (let i = 0; i < grid.length; i++) {
      if (keepoutGrid.grid[i] === WALL && grid[i] === WALL) {
        grid[i] = FREE
        cleared++
      }
    }
    console.log(`  removed keepout shelf pixels from structure grid: ${cleared}`)
  }

  console.log(`Processing ${label}: removing wall noise while preserving pillar-like components...`)
  const firstCleanup = removeWallNoisePreservingPillars(grid, width, height)
  console.log(`  removed: ${firstCleanup.removed}, pillar-like kept: ${firstCleanup.pillarLike}`)

  const closed = morphClose(grid, width, height)
  grid.set(closed)
  const secondCleanup = removeWallNoisePreservingPillars(grid, width, height)
  console.log(`  post-close removed: ${secondCleanup.removed}, pillar-like kept: ${secondCleanup.pillarLike}`)

  const enclosedResolve = resolveEnclosedRegions(grid, width, height)
  const freeSelection = keepSignificantFreeComponents(grid, width, height)
  console.log(
    `  enclosed regions: ${enclosedResolve.enclosedCount}, free-assigned: ${enclosedResolve.freeAssigned}, wall-assigned: ${enclosedResolve.wallAssigned}, largest-enclosed: ${enclosedResolve.largestEnclosedSize}, kept free: ${freeSelection.totalKeptSize} (${freeSelection.keptCount} components), interior-priority: ${freeSelection.usedInterior}, candidates: ${freeSelection.candidateCount}`,
  )
  const wallFilter = pruneWallsNotAdjacentToFree(grid, width, height)
  console.log(`  wall components kept near interior: ${wallFilter.kept}, wall pixels removed: ${wallFilter.removed}`)

  return loaded
}

async function intersectKeepoutWithPhotoWalls(keepoutGrid, photoImageName, config, wallThreshold, freeThreshold) {
  const photo = await readClassifiedImage(photoImageName, config, wallThreshold, freeThreshold, {
    resizeTo: { width: keepoutGrid.width, height: keepoutGrid.height },
  })
  assertSamePgmSize(keepoutGrid, photo, 'keepout', 'photo wall grid')

  const photoWallMask = dilate(photo.grid, photo.width, photo.height, WALL)
  let kept = 0
  let removed = 0
  for (let i = 0; i < keepoutGrid.grid.length; i++) {
    const keepoutWall = keepoutGrid.grid[i] === WALL
    const photoWall = photoWallMask[i] === WALL
    if (keepoutWall && photoWall) {
      keepoutGrid.grid[i] = WALL
      kept++
    } else {
      if (keepoutWall) removed++
      keepoutGrid.grid[i] = UNKNOWN
    }
  }

  console.log(
    `  photo/keepout bookshelf intersection: kept=${kept}, removed=${removed}, photo=${photo.imagePath}`,
  )
  return { kept, removed }
}

function axisAngleDiff(a, b) {
  let diff = normalizeAnglePi(a - b)
  if (diff > Math.PI / 2) diff -= Math.PI
  if (diff < -Math.PI / 2) diff += Math.PI
  return Math.abs(diff)
}

function summarizeWallBridgeComponent(component, width) {
  if (component.size < 10) return null
  const obb = componentOrientedBBox(component, width)
  let theta = -obb.angle
  let longPx = obb.w / RESOLUTION
  let shortPx = obb.d / RESOLUTION
  if (shortPx > longPx) {
    theta += Math.PI / 2
    const tmp = longPx
    longPx = shortPx
    shortPx = tmp
  }
  const aspect = longPx / Math.max(1e-6, shortPx)
  if (longPx < 7 || aspect < 2.2) return null
  return {
    component,
    theta: normalizeAnglePi(theta),
    col: obb.centerCol,
    row: obb.centerRow,
    halfLen: longPx / 2,
    halfThick: shortPx / 2,
  }
}

function drawBridgeLineIfClear(grid, width, height, keepoutGrid, x0, y0, x1, y1) {
  const points = []
  let x = Math.round(x0)
  let y = Math.round(y0)
  const tx = Math.round(x1)
  const ty = Math.round(y1)
  const dx = Math.abs(tx - x)
  const dy = -Math.abs(ty - y)
  const sx = x < tx ? 1 : -1
  const sy = y < ty ? 1 : -1
  let err = dx + dy

  while (true) {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0
    const idx = y * width + x
    if (keepoutGrid?.grid?.[idx] === WALL) return 0
    points.push(idx)
    if (x === tx && y === ty) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }

  let placed = 0
  for (const idx of points) {
    if (grid[idx] !== WALL) {
      grid[idx] = WALL
      placed++
    }
  }
  return placed
}

function bridgeWallGaps(grid, width, height, keepoutGrid) {
  const maxGapPx = Math.max(2, Math.round(0.9 / RESOLUTION))
  const maxPerpPx = Math.max(2, Math.round(0.18 / RESOLUTION))
  const maxAngleDiff = 14 * Math.PI / 180
  const { components } = extractComponents(grid, width, height, WALL)
  const candidates = components
    .map(c => summarizeWallBridgeComponent(c, width))
    .filter(Boolean)

  let bridges = 0
  let placed = 0
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]
    const cos = Math.cos(a.theta)
    const sin = Math.sin(a.theta)
    const aU = a.col * cos + a.row * sin
    const aV = -a.col * sin + a.row * cos
    const aMin = aU - a.halfLen
    const aMax = aU + a.halfLen

    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j]
      if (axisAngleDiff(a.theta, b.theta) > maxAngleDiff) continue
      const bU = b.col * cos + b.row * sin
      const bV = -b.col * sin + b.row * cos
      const perpGap = Math.abs(aV - bV)
      if (perpGap > Math.max(maxPerpPx, a.halfThick + b.halfThick + 1)) continue

      const bMin = bU - b.halfLen
      const bMax = bU + b.halfLen
      const gap = bMin > aMax ? bMin - aMax : aMin > bMax ? aMin - bMax : 0
      if (gap < 2 || gap > maxGapPx) continue

      const startU = bMin > aMax ? aMax : bMax
      const endU = bMin > aMax ? bMin : aMin
      const v = (aV + bV) / 2
      const x0 = startU * cos - v * sin
      const y0 = startU * sin + v * cos
      const x1 = endU * cos - v * sin
      const y1 = endU * sin + v * cos
      const added = drawBridgeLineIfClear(grid, width, height, keepoutGrid, x0, y0, x1, y1)
      if (added > 0) {
        bridges++
        placed += added
      }
    }
  }

  console.log(`  wall gap bridges: candidates=${candidates.length}, bridges=${bridges}, placed=${placed}`)
  return { candidates: candidates.length, bridges, placed }
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

function extractCellBoundaryLoops(grid, width, height, targetValue) {
  const segments = []
  const isTarget = (x, y) => x >= 0 && x < width && y >= 0 && y < height && grid[y * width + x] === targetValue
  const add = (a, b) => segments.push({ a, b })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isTarget(x, y)) continue
      if (!isTarget(x, y - 1)) add([x, y], [x + 1, y])
      if (!isTarget(x + 1, y)) add([x + 1, y], [x + 1, y + 1])
      if (!isTarget(x, y + 1)) add([x + 1, y + 1], [x, y + 1])
      if (!isTarget(x - 1, y)) add([x, y + 1], [x, y])
    }
  }

  const pKey = p => `${p[0]},${p[1]}`
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
      const aMatch = seg.a[0] === last[0] && seg.a[1] === last[1]
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

function finalizeMaskLoop(loop, imgHeight, offsetX, offsetZ) {
  const world = gridLoopToWorld(loop, imgHeight, offsetX, offsetZ)
  const simplified = KEEPOUT_LOOP_SIMPLIFY_M > 0 ? simplifyLoop(world, KEEPOUT_LOOP_SIMPLIFY_M) : world
  return dedupeLoop(pruneShortSegments(simplified, KEEPOUT_LOOP_MIN_SEGMENT_M))
}

function computeFloorOffset(rawFloorRects, imgHeight) {
  let sumX = 0
  let sumZ = 0
  let totalArea = 0
  for (const r of rawFloorRects) {
    const [x1, z1] = pxToWorld(r.x, r.y, imgHeight)
    const [x2, z2] = pxToWorld(r.x + r.w, r.y + r.h, imgHeight)
    const area = Math.abs(x2 - x1) * Math.abs(z2 - z1)
    sumX += ((x1 + x2) / 2) * area
    sumZ += ((z1 + z2) / 2) * area
    totalArea += area
  }
  return {
    offsetX: totalArea > 0 ? sumX / totalArea : 0,
    offsetZ: totalArea > 0 ? sumZ / totalArea : 0,
    totalArea,
  }
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

function componentFootprint(component, imgWidth, imgHeight, offsetX, offsetZ) {
  const componentGrid = new Uint8Array(imgWidth * imgHeight)
  for (const idx of component.indices) componentGrid[idx] = FREE
  const loops = extractCellBoundaryLoops(componentGrid, imgWidth, imgHeight, FREE)
    .map(loop => finalizeMaskLoop(loop, imgHeight, offsetX, offsetZ))
    .filter(loop => loop.length >= 3)
  if (loops.length === 0) return []
  loops.sort((a, b) => Math.abs(loopSignedArea(b)) - Math.abs(loopSignedArea(a)))
  return loops[0]
}

function componentRect(component, imgHeight, offsetX, offsetZ) {
  const [x1, z1] = pxToWorld(component.minX, component.minY, imgHeight)
  const [x2, z2] = pxToWorld(component.maxX + 1, component.maxY + 1, imgHeight)
  return {
    cx: Math.round((((x1 + x2) / 2) - offsetX) * 1000) / 1000,
    cz: Math.round((((z1 + z2) / 2) - offsetZ) * 1000) / 1000,
    w: Math.round(Math.abs(x2 - x1) * 1000) / 1000,
    d: Math.round(Math.abs(z2 - z1) * 1000) / 1000,
  }
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
  if (n < 2) {
    const idx0 = component.indices[0] ?? 0
    const col0 = idx0 % imgWidth
    return { angle: 0, w: RESOLUTION, d: RESOLUTION, centerCol: col0, centerRow: (idx0 - col0) / imgWidth }
  }

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

  // Oriented-box center in pixel space (midpoint of projected extents, not pixel mean).
  const midU = (minU + maxU) / 2
  const midV = (minV + maxV) / 2
  const centerCol = meanCol + midU * cosT - midV * sinT
  const centerRow = meanRow + midU * sinT + midV * cosT

  // World angle: negate pixel angle because row↓ maps to world Z↑
  return { angle: -thetaPx, w: extentU, d: extentV, centerCol, centerRow }
}

function normalizeAnglePi(angle) {
  let a = angle
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function footprintOrientedBBox(footprint) {
  if (footprint.length < 3) return null
  let best = null
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % footprint.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    if (len <= 1e-6) continue

    const angle = Math.atan2(dz, dx)
    const cosT = dx / len
    const sinT = dz / len
    let minU = Infinity, maxU = -Infinity
    let minV = Infinity, maxV = -Infinity
    for (const p of footprint) {
      const u = p[0] * cosT + p[1] * sinT
      const v = -p[0] * sinT + p[1] * cosT
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }

    const w = maxU - minU
    const d = maxV - minV
    const area = w * d
    if (!Number.isFinite(area) || area <= 0) continue
    if (!best || area < best.area - 1e-9) {
      best = { angle, minU, maxU, minV, maxV, w, d, area }
    }
  }
  if (!best) return null

  const midU = (best.minU + best.maxU) / 2
  const midV = (best.minV + best.maxV) / 2
  const cosT = Math.cos(best.angle)
  const sinT = Math.sin(best.angle)
  let w = best.w
  let d = best.d
  let angle = best.angle
  if (d > w) {
    const previousW = w
    w = d
    d = previousW
    angle += Math.PI / 2
  }

  return {
    angle: normalizeAnglePi(angle),
    w,
    d,
    centerX: midU * cosT - midV * sinT,
    centerZ: midU * sinT + midV * cosT,
  }
}

function roundN(value, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function renderedBookshelfFootprint({ cx, cz, w, d, yaw }) {
  const hw = w * 0.5
  const hd = d * 0.5
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => [
    cx + lx * c + lz * s,
    cz - lx * s + lz * c,
  ])
}

function makeManualBookshelfOverride(spec) {
  const shelf = {
    cx: roundN(spec.center.x),
    cz: roundN(spec.center.z),
    w: roundN(spec.w),
    d: roundN(spec.d),
    yaw: roundN(spec.yaw, 4),
    h: 2.34,
  }
  return {
    ...shelf,
    footprint: renderedBookshelfFootprint(shelf).map(([x, z]) => [roundN(x), roundN(z)]),
    manualLabel: spec.label,
    clearStructure: spec.clearStructure,
  }
}

function makeCornerBookshelfPair(spec) {
  const armLengthM = roundN(spec.armLengthM)
  const armDepthM = roundN(spec.armDepthM)
  const parent = {
    cx: roundN(spec.corner.x),
    cz: roundN(spec.corner.z),
    yaw: roundN(spec.primaryYaw, 4),
    w: armLengthM,
    d: armLengthM,
    h: 2.34,
  }
  const { missingSx, missingSz } = spec
  const t = armDepthM
  const xArm = makeShelfFromLocalRect(
    parent,
    0,
    -missingSz * (parent.d * 0.5 - t * 0.5),
    parent.w,
    t,
  )
  const zArm = makeShelfFromLocalRect(
    parent,
    -missingSx * (parent.w * 0.5 - t * 0.5),
    missingSz * (t * 0.5),
    parent.w,
    t,
    Math.PI / 2,
  )
  return [
    { ...xArm, manualLabel: `${spec.label} primary arm` },
    { ...zArm, manualLabel: `${spec.label} secondary arm` },
  ]
}

function isShelfNearManualOverride(shelf) {
  return MANUAL_KEEP_OUT_BOOKSHELF_OVERRIDES.some(spec =>
    Math.hypot(shelf.cx - spec.center.x, shelf.cz - spec.center.z) <= spec.replaceRadiusM,
  )
}

function isShelfNearCornerGroup(shelf) {
  return MANUAL_L_CORNER_BOOKSHELF_GROUPS.some(spec =>
    Math.hypot(shelf.cx - spec.corner.x, shelf.cz - spec.corner.z) <= spec.replaceRadiusM,
  )
}

function applyManualBookshelfOverrides(shelves) {
  const filtered = shelves.filter(shelf =>
    !isShelfNearManualOverride(shelf) && !isShelfNearCornerGroup(shelf),
  )
  filtered.push(...MANUAL_KEEP_OUT_BOOKSHELF_OVERRIDES.map(makeManualBookshelfOverride))
  for (const group of MANUAL_L_CORNER_BOOKSHELF_GROUPS) {
    filtered.push(...makeCornerBookshelfPair(group))
  }
  filtered.sort((a, b) => {
    if (Math.abs(a.cz - b.cz) > 1e-6) return b.cz - a.cz
    return a.cx - b.cx
  })
  return filtered
}

function appWorldToPixel(x, z, height, offsetX, offsetZ) {
  const wx = x + offsetX
  const wz = z + offsetZ
  return {
    col: (wx - ORIGIN_X) / RESOLUTION,
    row: height - 1 - ((wz - ORIGIN_Y) / RESOLUTION),
  }
}

function pointInPolygon(px, py, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].col
    const yi = polygon[i].row
    const xj = polygon[j].col
    const yj = polygon[j].row
    const intersects = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / Math.max(1e-9, yj - yi) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function clearManualShelfStructurePixels(grid, width, height, offsetX, offsetZ) {
  let cleared = 0
  for (const spec of MANUAL_KEEP_OUT_BOOKSHELF_OVERRIDES) {
    if (!spec.clearStructure) continue
    const shelf = makeManualBookshelfOverride(spec)
    const pixelPoly = shelf.footprint.map(([x, z]) => appWorldToPixel(x, z, height, offsetX, offsetZ))
    const minCol = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.col))) - 1)
    const maxCol = Math.min(width - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.col))) + 1)
    const minRow = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.row))) - 1)
    const maxRow = Math.min(height - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.row))) + 1)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!pointInPolygon(col + 0.5, row + 0.5, pixelPoly)) continue
        const idx = row * width + col
        if (grid[idx] === WALL) {
          grid[idx] = FREE
          cleared++
        }
      }
    }
  }
  console.log(`  manual bookshelf wall pixels cleared: ${cleared}`)
}

function pixelCenterToAppWorld(col, row, imgHeight, offsetX, offsetZ) {
  const wx = ORIGIN_X + (col + 0.5) * RESOLUTION
  const wz = ORIGIN_Y + (imgHeight - 1 - (row + 0.5)) * RESOLUTION
  return { x: wx - offsetX, z: wz - offsetZ }
}

function isShelfLocalRectPoint(px, pz, shelf, halfW, minZ, maxZ) {
  const { lx, lz } = shelfWorldToLocal(px, pz, shelf)
  return Math.abs(lx) <= halfW && lz >= minZ && lz <= maxZ
}

function countFreeNearShelfSide(grid, width, height, imgHeight, offsetX, offsetZ, shelf, side) {
  let free = 0
  const sampleCount = 5
  const sampleZ = side * (shelf.d * 0.5 + 0.45)
  const halfW = Math.max(0.05, shelf.w * 0.5 - 0.08)
  for (let i = 0; i < sampleCount; i++) {
    const t = sampleCount === 1 ? 0 : i / (sampleCount - 1)
    const lx = -halfW + t * halfW * 2
    const p = localToShelfWorld(lx, sampleZ, shelf)
    const pp = appWorldToPixel(p.x, p.z, imgHeight, offsetX, offsetZ)
    const c0 = Math.round(pp.col)
    const r0 = Math.round(pp.row)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc
        const r = r0 + dr
        if (c < 0 || c >= width || r < 0 || r >= height) continue
        if (grid[r * width + c] === FREE) free++
      }
    }
  }
  return free
}

function shelfOpenSignFromGrid(grid, width, height, imgHeight, offsetX, offsetZ, shelf) {
  const posFree = countFreeNearShelfSide(grid, width, height, imgHeight, offsetX, offsetZ, shelf, 1)
  const negFree = countFreeNearShelfSide(grid, width, height, imgHeight, offsetX, offsetZ, shelf, -1)
  return posFree >= negFree ? 1 : -1
}

function clearWallPixelsAroundShelf(grid, width, height, imgHeight, offsetX, offsetZ, shelf) {
  const corners = [
    localToShelfWorld(-shelf.w * 0.5 - STRAIGHTEN_WALL_CLEAR_MARGIN_M, -shelf.d * 0.5 - STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf),
    localToShelfWorld(shelf.w * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M, -shelf.d * 0.5 - STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf),
    localToShelfWorld(shelf.w * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf.d * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf),
    localToShelfWorld(-shelf.w * 0.5 - STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf.d * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M, shelf),
  ].map(p => appWorldToPixel(p.x, p.z, imgHeight, offsetX, offsetZ))

  const minCol = Math.max(0, Math.floor(Math.min(...corners.map(p => p.col))) - 1)
  const maxCol = Math.min(width - 1, Math.ceil(Math.max(...corners.map(p => p.col))) + 1)
  const minRow = Math.max(0, Math.floor(Math.min(...corners.map(p => p.row))) - 1)
  const maxRow = Math.min(height - 1, Math.ceil(Math.max(...corners.map(p => p.row))) + 1)
  const halfW = shelf.w * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M
  const minZ = -shelf.d * 0.5 - STRAIGHTEN_WALL_CLEAR_MARGIN_M
  const maxZ = shelf.d * 0.5 + STRAIGHTEN_WALL_CLEAR_MARGIN_M
  let cleared = 0

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const world = pixelCenterToAppWorld(col, row, imgHeight, offsetX, offsetZ)
      if (!isShelfLocalRectPoint(world.x, world.z, shelf, halfW, minZ, maxZ)) continue
      const idx = row * width + col
      if (grid[idx] === WALL) {
        grid[idx] = FREE
        cleared++
      }
    }
  }
  return cleared
}

function drawStraightWallBehindShelf(grid, width, height, imgHeight, offsetX, offsetZ, shelf, backSign) {
  const wallHalfT = STRAIGHTEN_WALL_THICKNESS_M * 0.5
  const halfW = shelf.w * 0.5 + STRAIGHTEN_WALL_EXTEND_M
  const wallZ = backSign * (shelf.d * 0.5 + STRAIGHTEN_WALL_BACK_OFFSET_M)
  const corners = [
    localToShelfWorld(-halfW, wallZ - wallHalfT, shelf),
    localToShelfWorld(halfW, wallZ - wallHalfT, shelf),
    localToShelfWorld(halfW, wallZ + wallHalfT, shelf),
    localToShelfWorld(-halfW, wallZ + wallHalfT, shelf),
  ].map(p => appWorldToPixel(p.x, p.z, imgHeight, offsetX, offsetZ))

  const minCol = Math.max(0, Math.floor(Math.min(...corners.map(p => p.col))) - 1)
  const maxCol = Math.min(width - 1, Math.ceil(Math.max(...corners.map(p => p.col))) + 1)
  const minRow = Math.max(0, Math.floor(Math.min(...corners.map(p => p.row))) - 1)
  const maxRow = Math.min(height - 1, Math.ceil(Math.max(...corners.map(p => p.row))) + 1)
  let placed = 0

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const world = pixelCenterToAppWorld(col, row, imgHeight, offsetX, offsetZ)
      const { lx, lz } = shelfWorldToLocal(world.x, world.z, shelf)
      if (Math.abs(lx) > halfW || Math.abs(lz - wallZ) > wallHalfT) continue
      const idx = row * width + col
      if (grid[idx] !== WALL) placed++
      grid[idx] = WALL
    }
  }
  return placed
}

function straightenWallsBehindShelves(grid, width, height, imgHeight, offsetX, offsetZ, shelves) {
  let affectedShelves = 0
  let clearedPixels = 0
  let placedPixels = 0

  for (const shelf of shelves) {
    const cleared = clearWallPixelsAroundShelf(grid, width, height, imgHeight, offsetX, offsetZ, shelf)
    if (cleared === 0) continue
    const openSign = shelfOpenSignFromGrid(grid, width, height, imgHeight, offsetX, offsetZ, shelf)
    const backSign = -openSign
    const placed = drawStraightWallBehindShelf(grid, width, height, imgHeight, offsetX, offsetZ, shelf, backSign)
    affectedShelves++
    clearedPixels += cleared
    placedPixels += placed
  }

  return { affectedShelves, clearedPixels, placedPixels }
}

function localToShelfWorld(lx, lz, shelf) {
  const c = Math.cos(shelf.yaw)
  const s = Math.sin(shelf.yaw)
  return {
    x: shelf.cx + lx * c + lz * s,
    z: shelf.cz - lx * s + lz * c,
  }
}

function shelfWorldToLocal(px, pz, shelf) {
  const dx = px - shelf.cx
  const dz = pz - shelf.cz
  const c = Math.cos(shelf.yaw)
  const s = Math.sin(shelf.yaw)
  return {
    lx: dx * c - dz * s,
    lz: dx * s + dz * c,
  }
}

function makeShelfFromLocalRect(parent, lx, lz, w, d, yawOffset = 0) {
  const center = localToShelfWorld(lx, lz, parent)
  const shelf = {
    cx: roundN(center.x),
    cz: roundN(center.z),
    w: roundN(w),
    d: roundN(d),
    yaw: roundN(normalizeAnglePi(parent.yaw + yawOffset), 4),
    h: parent.h,
  }
  return {
    ...shelf,
    footprint: renderedBookshelfFootprint(shelf).map(([x, z]) => [roundN(x), roundN(z)]),
    splitFrom: parent.splitFrom ?? parent.sourceSize ?? null,
  }
}

function findRectangularBookshelfOverride(shelf) {
  return FORCE_RECTANGULAR_BOOKSHELF_OVERRIDES.find(spec =>
    Math.hypot(shelf.cx - spec.center.x, shelf.cz - spec.center.z) <= spec.radiusM,
  ) ?? null
}

function forceShelfToRenderedRectangle(shelf, override) {
  return {
    ...shelf,
    footprint: renderedBookshelfFootprint(shelf).map(([x, z]) => [roundN(x), roundN(z)]),
    cornerSplit: null,
    forcedRectangular: override.label,
  }
}

function isConcaveFootprint(footprint) {
  if (!footprint || footprint.length < 5) return false
  let positive = 0
  let negative = 0
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % footprint.length]
    const c = footprint[(i + 2) % footprint.length]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-6) continue
    if (cross > 0) positive++
    else negative++
  }
  return positive > 0 && negative > 0
}

function estimateCornerShelfSplit(component, imgWidth, imgHeight, offsetX, offsetZ, shelf) {
  const aspect = Math.max(shelf.w, shelf.d) / Math.max(1e-6, Math.min(shelf.w, shelf.d))
  const obbFill = component.size * RESOLUTION * RESOLUTION / Math.max(1e-6, shelf.w * shelf.d)
  const concaveFootprint = isConcaveFootprint(shelf.footprint)
  if (shelf.w < 1 || shelf.d < 1 || aspect > 1.8) return null
  if (!concaveFootprint && obbFill > 0.82) return null

  const quadrants = new Map([
    ['-1,-1', 0],
    ['-1,1', 0],
    ['1,-1', 0],
    ['1,1', 0],
  ])
  for (const idx of component.indices) {
    const col = idx % imgWidth
    const row = (idx - col) / imgWidth
    const [wx, wz] = pxToWorld(col + 0.5, row + 0.5, imgHeight)
    const { lx, lz } = shelfWorldToLocal(wx - offsetX, wz - offsetZ, shelf)
    const sx = lx >= 0 ? 1 : -1
    const sz = lz >= 0 ? 1 : -1
    quadrants.set(`${sx},${sz}`, (quadrants.get(`${sx},${sz}`) ?? 0) + 1)
  }

  const ranked = [...quadrants.entries()].sort((a, b) => a[1] - b[1])
  const total = component.indices.length
  const [missingKey, missingCount] = ranked[0]
  const filledCounts = ranked.slice(1).map(([, count]) => count)
  const nextCount = ranked[1]?.[1] ?? total
  const isCorner = concaveFootprint
    ? filledCounts.every(count => count >= total * 0.05)
    : missingCount <= total * 0.08 && filledCounts.every(count => count >= total * 0.12)
  void nextCount
  if (!isCorner) return null

  const [missingSx, missingSz] = missingKey.split(',').map(Number)
  return {
    missingSx,
    missingSz,
    obbFill,
  }
}

function splitCornerShelves(shelves) {
  const straightDepths = shelves
    .filter(s => !s.cornerSplit && Math.max(s.w, s.d) / Math.max(1e-6, Math.min(s.w, s.d)) >= 1.8)
    .map(s => Math.min(s.w, s.d))
    .filter(v => v >= 0.35 && v <= 1.1)
  const defaultDepth = median(straightDepths) || 0.65
  const out = []
  let splitCount = 0

  for (const shelf of shelves) {
    if (!shelf.cornerSplit) {
      out.push(shelf)
      continue
    }

    const { missingSx, missingSz } = shelf.cornerSplit
    const t = Math.min(defaultDepth, shelf.w * 0.45, shelf.d * 0.45)
    const xArm = makeShelfFromLocalRect(
      shelf,
      0,
      -missingSz * (shelf.d * 0.5 - t * 0.5),
      shelf.w,
      t,
    )
    const zArm = makeShelfFromLocalRect(
      shelf,
      -missingSx * (shelf.w * 0.5 - t * 0.5),
      missingSz * (t * 0.5),
      Math.max(t, shelf.d - t),
      t,
      Math.PI / 2,
    )
    out.push(xArm, zArm)
    splitCount++
  }

  console.log(`  corner bookshelf splits: ${splitCount} shelf components -> ${splitCount * 2} straight shelves`)
  return out
}

function stripInternalShelfFields(shelf) {
  const { sourceSize, cornerSplit, splitFrom, manualLabel, clearStructure, forcedRectangular, ...publicShelf } = shelf
  void sourceSize
  void cornerSplit
  void splitFrom
  void manualLabel
  void clearStructure
  void forcedRectangular
  return publicShelf
}

function pointsNearlyEqual(a, b, tolerance = 0.03) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance
}

function replaceClosedLoopForwardRange(loop, start, end) {
  const startIndex = loop.findIndex(p => pointsNearlyEqual(p, start))
  const endIndex = loop.findIndex(p => pointsNearlyEqual(p, end))
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return null
  if (startIndex < endIndex) {
    return [
      ...loop.slice(0, startIndex + 1),
      loop[endIndex],
      ...loop.slice(endIndex + 1),
    ]
  }
  return loop.slice(endIndex, startIndex + 1)
}

function applyManualPolylineStraightening(polylines) {
  const out = polylines.map(loop => loop.map(p => [...p]))
  let applied = 0
  for (const spec of MANUAL_POLYLINE_STRAIGHTENING) {
    const loop = out[spec.loopIndex]
    if (!loop || loop.length < 3) continue
    let replaced = replaceClosedLoopForwardRange(loop, spec.start, spec.end)
    if (!replaced || replaced.length < 3) {
      console.log(`  manual wall straightening skipped: ${spec.label}`)
      continue
    }
    if (spec.startOverride) {
      const idx = replaced.findIndex(p => pointsNearlyEqual(p, spec.start))
      if (idx >= 0) {
        replaced[idx] = [...spec.startOverride]
      }
    }
    if (spec.endOverride) {
      const idx = replaced.findIndex(p => pointsNearlyEqual(p, spec.end))
      if (idx >= 0) {
        replaced[idx] = [...spec.endOverride]
      }
    }
    out[spec.loopIndex] = replaced
    applied++
    console.log(`  manual wall straightening: ${spec.label}`)
  }
  return { polylines: out, applied }
}

function makeManualPhotoBookshelf(spec) {
  const shelf = {
    cx: spec.cx,
    cz: spec.cz,
    w: spec.w,
    d: spec.d,
    yaw: spec.yaw,
    h: spec.h,
  }
  return {
    ...shelf,
    footprint: renderedBookshelfFootprint(shelf).map(([x, z]) => [roundN(x), roundN(z)]),
    manualLabel: spec.label,
  }
}

function addManualPhotoBookshelves(shelves) {
  const out = [...shelves]
  let added = 0
  for (const spec of MANUAL_PHOTO_BOOKSHELF_ADDITIONS) {
    const duplicate = out.some(shelf =>
      Math.hypot(shelf.cx - spec.cx, shelf.cz - spec.cz) <= 0.5,
    )
    if (duplicate) continue
    out.push(makeManualPhotoBookshelf(spec))
    added++
  }
  out.sort((a, b) => {
    if (Math.abs(a.cz - b.cz) > 1e-6) return b.cz - a.cz
    return a.cx - b.cx
  })
  console.log(`  manual photo bookshelf additions: ${added}`)
  return out
}

function clearManualPhotoBookshelfWallPixels(grid, width, height, offsetX, offsetZ) {
  let cleared = 0
  for (const spec of MANUAL_PHOTO_BOOKSHELF_ADDITIONS) {
    const shelf = makeManualPhotoBookshelf(spec)
    const pixelPoly = shelf.footprint.map(([x, z]) => appWorldToPixel(x, z, height, offsetX, offsetZ))
    const minCol = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.col))) - 1)
    const maxCol = Math.min(width - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.col))) + 1)
    const minRow = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.row))) - 1)
    const maxRow = Math.min(height - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.row))) + 1)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!pointInPolygon(col + 0.5, row + 0.5, pixelPoly)) continue
        const idx = row * width + col
        if (grid[idx] === WALL) {
          grid[idx] = FREE
          cleared++
        }
      }
    }
  }
  console.log(`  manual photo bookshelf wall pixels cleared: ${cleared}`)
  return cleared
}

function extractKeepoutBookshelves(keepoutGrid, offsetX, offsetZ, options = {}) {
  const applyManualOverridesEnabled = options.applyManualOverrides ?? true
  const splitCornerShelvesEnabled = options.splitCornerShelves ?? false
  const { width, height, grid } = keepoutGrid
  const { components } = extractComponents(grid, width, height, WALL)
  const shelves = []
  for (const c of components) {
    if (c.touchesBoundary || c.size < 100) continue
    const footprint = componentFootprint(c, width, height, offsetX, offsetZ)
    if (footprint.length < 3) continue
    const pcaObb = componentOrientedBBox(c, width)
    const footprintObb = footprintOrientedBBox(footprint)
    const obb = footprintObb ?? pcaObb
    const longSide = Math.max(obb.w, obb.d)
    const shortSide = Math.min(obb.w, obb.d)
    const rawAngle = obb.w >= obb.d ? obb.angle : obb.angle + Math.PI / 2
    const [pcaMx, pcaMz] = pxToWorld(pcaObb.centerCol, pcaObb.centerRow, height)
    const cx = roundN(footprintObb ? footprintObb.centerX : pcaMx - offsetX)
    const cz = roundN(footprintObb ? footprintObb.centerZ : pcaMz - offsetZ)
    const yaw = roundN(normalizeAnglePi(-rawAngle), 4)
    let shelf = {
      cx,
      cz,
      w: roundN(longSide),
      d: roundN(shortSide),
      yaw,
      h: 2.34,
      footprint: footprint.map(([x, z]) => [roundN(x), roundN(z)]),
      sourceSize: c.size,
    }
    const rectangularOverride = findRectangularBookshelfOverride(shelf)
    if (rectangularOverride) {
      shelf = forceShelfToRenderedRectangle(shelf, rectangularOverride)
    } else {
      shelf.cornerSplit = estimateCornerShelfSplit(c, width, height, offsetX, offsetZ, shelf)
    }
    shelves.push(shelf)
  }
  let outputShelves = splitCornerShelvesEnabled ? splitCornerShelves(shelves) : shelves
  if (applyManualOverridesEnabled) outputShelves = applyManualBookshelfOverrides(outputShelves)
  outputShelves.sort((a, b) => {
    if (Math.abs(a.cz - b.cz) > 1e-6) return b.cz - a.cz
    return a.cx - b.cx
  })
  return outputShelves.map(stripInternalShelfFields)
}

function writeBookshelfOverlayLayer(shelves) {
  const compactShelves = shelves.map(s => ({
    cx: s.cx,
    cz: s.cz,
    w: s.w,
    d: s.d,
    yaw: s.yaw,
    h: s.h,
    footprint: s.footprint,
  }))
  const text = `// Auto-generated from map_info/keepout_mask.pgm -- do not edit manually.
// Run: node scripts/processMap.mjs

import type { FixtureRenderInstance } from '../types/scene'

export const counterOverlayLayerInstances: FixtureRenderInstance[] = []

export function isCounterOverlaidByBookshelfOverlayLayer(c: FixtureRenderInstance): boolean {
  void c
  return false
}

const KEEPOUT_MASK_BOOKSHELVES: Omit<FixtureRenderInstance, 'kind'>[] = ${JSON.stringify(compactShelves)}

export const bookshelfOverlayLayerInstances: FixtureRenderInstance[] = KEEPOUT_MASK_BOOKSHELVES.map((r) => ({
  kind: 'bookshelf' as const,
  ...r,
}))
`
  const outPath = resolve(ROOT, 'src', 'data', 'bookshelfOverlayLayer.ts')
  writeFileSync(outPath, text, 'utf-8')
  console.log(`Wrote ${outPath}`)
  console.log(`  keepout bookshelf fixtures: ${shelves.length}`)
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
  const imageArg = process.argv.indexOf('--image')
  const imageOverride = imageArg >= 0 ? process.argv[imageArg + 1] : null
  const frameImageArg = process.argv.indexOf('--frame-image')
  const frameImageOverride = frameImageArg >= 0 ? process.argv[frameImageArg + 1] : null
  const keepoutImageArg = process.argv.indexOf('--keepout-image')
  const keepoutImageOverride = keepoutImageArg >= 0 ? process.argv[keepoutImageArg + 1] : null
  const mapOffsetOnly = process.argv.includes('--map-offset-only')
  const writeSourcePatches = process.argv.includes('--write-source-patches')
  const noCorrections = process.argv.includes('--no-corrections')
  const splitCornerShelvesEnabled = process.argv.includes('--split-corner-shelves')
  const straightenWallsBehindShelvesEnabled = process.argv.includes('--straighten-walls-behind-shelves')
  const photoKeepoutIntersectionEnabled = process.argv.includes('--photo-keepout-intersection')
  const bridgeWallGapsEnabled = process.argv.includes('--bridge-wall-gaps')
  const noManualShelfOverrides = process.argv.includes('--no-manual-shelf-overrides')

  const config = parseYamlMapConfig(YAML_PATH)
  RESOLUTION = config.resolution
  ORIGIN_X = config.originX
  ORIGIN_Y = config.originY
  const structureImageName = imageOverride ?? DEFAULT_STRUCTURE_IMAGE
  const frameImageName = frameImageOverride ?? DEFAULT_FRAME_IMAGE
  const keepoutImageName = keepoutImageOverride ?? DEFAULT_KEEPOUT_IMAGE
  const { wallThreshold, freeThreshold } = thresholdsFromYaml(config.occupiedThresh, config.freeThresh)

  console.log(`YAML map config: ${YAML_PATH}`)
  console.log(`  structure image: ${structureImageName}`)
  console.log(`  frame image: ${frameImageName}`)
  console.log(`  keepout image: ${keepoutImageName}`)
  console.log(`  corrections: ${noCorrections ? 'disabled' : 'enabled'}`)
  console.log(`  corner shelf splitting: ${splitCornerShelvesEnabled ? 'enabled' : 'disabled'}`)
  console.log(`  straighten walls behind shelves: ${straightenWallsBehindShelvesEnabled ? 'enabled' : 'disabled'}`)
  console.log(`  photo/keepout bookshelf intersection: ${photoKeepoutIntersectionEnabled ? 'enabled' : 'disabled'}`)
  console.log(`  bridge wall gaps: ${bridgeWallGapsEnabled ? 'enabled' : 'disabled'}`)
  console.log(`  manual shelf overrides: ${noManualShelfOverrides || noCorrections ? 'disabled' : 'enabled'}`)

  if (writeSourcePatches && !noCorrections) {
    writePatchedSourcePgms(structureImageName, frameImageName, keepoutImageName)
  } else if (writeSourcePatches && noCorrections) {
    console.log('  skipped source PGM patches because --no-corrections is set')
  }

  const keepoutGrid = await readClassifiedImage(keepoutImageName, config, wallThreshold, freeThreshold)
  if (photoKeepoutIntersectionEnabled) {
    await intersectKeepoutWithPhotoWalls(keepoutGrid, structureImageName, config, wallThreshold, freeThreshold)
  }
  const rasterResizeTo = { width: keepoutGrid.width, height: keepoutGrid.height }
  const structure = await buildProcessedGrid(
    structureImageName,
    config,
    wallThreshold,
    freeThreshold,
    'structure image',
    keepoutGrid,
    { resizeTo: rasterResizeTo },
  )
  const frame = await buildProcessedGrid(
    frameImageName,
    config,
    wallThreshold,
    freeThreshold,
    'frame image',
    null,
    { resizeTo: rasterResizeTo },
  )

  const { width, height, grid } = structure
  if (frame.width !== width || frame.height !== height) {
    throw new Error(`Frame image ${frame.width}x${frame.height} must match structure image ${width}x${height}`)
  }
  if (keepoutGrid.width !== width || keepoutGrid.height !== height) {
    throw new Error(`Keepout image ${keepoutGrid.width}x${keepoutGrid.height} must match structure image ${width}x${height}`)
  }

  if (bridgeWallGapsEnabled) {
    bridgeWallGaps(grid, width, height, keepoutGrid)
  }

  let rawFloorRects = greedyMesh(grid, width, height, FREE)
  const frameFloorRects = greedyMesh(frame.grid, frame.width, frame.height, FREE)
  const { offsetX, offsetZ } = computeFloorOffset(frameFloorRects, frame.height)
  console.log(`  center offset: (${offsetX.toFixed(2)}, ${offsetZ.toFixed(2)})`)

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
        image: structureImageName,
        frameImage: frameImageName,
        keepoutImage: keepoutImageName,
      }),
    )
    process.exit(0)
  }

  if (!noCorrections && !noManualShelfOverrides) {
    clearManualShelfStructurePixels(grid, width, height, offsetX, offsetZ)
  } else if (noManualShelfOverrides) {
    console.log('  skipped manual bookshelf wall clearing because --no-manual-shelf-overrides is set')
  } else {
    console.log('  skipped manual bookshelf wall clearing because --no-corrections is set')
  }

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

  let keepoutShelves = extractKeepoutBookshelves(keepoutGrid, offsetX, offsetZ, {
    applyManualOverrides: !noCorrections && !noManualShelfOverrides,
    splitCornerShelves: splitCornerShelvesEnabled,
  })
  keepoutShelves = addManualPhotoBookshelves(keepoutShelves)
  if (clearManualPhotoBookshelfWallPixels(grid, width, height, offsetX, offsetZ) > 0) {
    rawFloorRects = greedyMesh(grid, width, height, FREE)
  }
  if (straightenWallsBehindShelvesEnabled) {
    const straightenStats = straightenWallsBehindShelves(
      grid,
      width,
      height,
      height,
      offsetX,
      offsetZ,
      keepoutShelves,
    )
    rawFloorRects = greedyMesh(grid, width, height, FREE)
    console.log(
      `  bookshelf-backed wall straightening: shelves=${straightenStats.affectedShelves}, cleared=${straightenStats.clearedPixels}, placed=${straightenStats.placedPixels}`,
    )
  }
  if (!noCorrections) {
    const preRelocateWallExtract = extractComponents(grid, width, height, WALL)
    const aisleRelocateStats = relocateInterAisleWallsBehindShelves({
      grid,
      width,
      height,
      imgHeight: height,
      offsetX,
      offsetZ,
      resolution: RESOLUTION,
      originX: ORIGIN_X,
      originY: ORIGIN_Y,
      shelves: keepoutShelves,
      wallLoops: centerLoops,
      wallComponents: preRelocateWallExtract.components,
    })
    console.log(
      `  inter-aisle wall components relocated: ${aisleRelocateStats.relocatedComponents}, pixels moved: ${aisleRelocateStats.movedPixels}, corridor pixels cleared: ${aisleRelocateStats.corridorCleared}, footprint cleared: ${aisleRelocateStats.footprintCleared}`,
    )
    rawFloorRects = greedyMesh(grid, width, height, FREE)
  } else {
    console.log('  skipped inter-aisle wall relocation because --no-corrections is set')
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
    const looksLikeShelf = false && (looksLikeShelfNearOuterWall || looksLikeInteriorShelfBlock)
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
  let wallPolylines = classifiedLoops.map(c => c.renderLoop)
  const wallHolePolylines = classifiedLoops
    .filter((c, i) => i !== outerLoopIdx && !c.isRoom)
    .map(c => c.holeLoop)
  const manualStraightening = applyManualPolylineStraightening(wallPolylines)
  wallPolylines = manualStraightening.polylines
  console.log(`  manual wall straightening applied: ${manualStraightening.applied}`)
  console.log(`  classified loops: ${classifiedLoops.length} total, ${wallHolePolylines.length} holes, ${classifiedLoops.filter(c => c.isRoom).length} rooms`)
  const fallbackPolylines = wallPolylines.length > 0 ? wallPolylines : centerLoops
  const principalAxes = computePrincipalAxes(fallbackPolylines)
  console.log(`  principal axes: [${principalAxes.map(a => a.toFixed(4)).join(', ')}]`)

  console.log(`  keepout bookshelf components: ${keepoutShelves.length}`)
  let finalBookshelfRects = keepoutShelves.map(({ cx, cz, w, d }) => ({ cx, cz, w, d }))
  let finalBookshelfInstances = keepoutShelves.map(({ cx, cz, w, d, yaw }) => ({ cx, cz, w, d, yaw }))

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
  } else if (finalBookshelfInstances.length === 0) {
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

  const sourceLabel = deltaImageName
    ? `${structureImageName} + delta ${deltaImageName}`
    : `${structureImageName} (frame ${frameImageName}, keepout ${keepoutImageName}${photoKeepoutIntersectionEnabled ? ', photo/keepout intersection' : ''})`
  const runFlags = [
    deltaImageName ? `--delta ${deltaImageName}` : '',
    noCorrections ? '--no-corrections' : '',
    splitCornerShelvesEnabled ? '--split-corner-shelves' : '',
    straightenWallsBehindShelvesEnabled ? '--straighten-walls-behind-shelves' : '',
    photoKeepoutIntersectionEnabled ? '--photo-keepout-intersection' : '',
    bridgeWallGapsEnabled ? '--bridge-wall-gaps' : '',
    noManualShelfOverrides ? '--no-manual-shelf-overrides' : '',
  ].filter(Boolean).join(' ')
  const ts = `// Auto-generated from ${sourceLabel} — do not edit manually.
// Run: node scripts/processMap.mjs${runFlags ? ' ' + runFlags : ''}

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
export const wallRenderRects: WallRect[] = wallRects
export const bookshelfRects: WallRect[] = ${JSON.stringify(finalBookshelfRects)}
export const bookshelfInstances: BookshelfInstance[] = ${JSON.stringify(finalBookshelfInstances)}
export const pillarRects: WallRect[] = ${JSON.stringify(pillarRects)}
export const wallPolylines: Point2[][] = ${JSON.stringify(wallPolylines)}
export const wallHolePolylines: Point2[][] = ${JSON.stringify(wallHolePolylines)}
export const floorRects: WallRect[] = ${JSON.stringify(floorRects)}
export const floorRenderRects: WallRect[] = floorRects
`
  const outPath = resolve(ROOT, 'src', 'data', 'mapData.ts')
  writeFileSync(outPath, ts, 'utf-8')
  console.log(`Wrote ${outPath}`)
  console.log(`  wallRects: ${wallRects.length}`)
  console.log(`  bookshelfRects: ${finalBookshelfRects.length}`)
  console.log(`  pillarRects: ${pillarRects.length}`)
  console.log(`  wallPolylines: ${wallPolylines.length}, wallHolePolylines: ${wallHolePolylines.length}`)
  console.log(`  floorRects: ${floorRects.length}`)
  writeBookshelfOverlayLayer(keepoutShelves)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
