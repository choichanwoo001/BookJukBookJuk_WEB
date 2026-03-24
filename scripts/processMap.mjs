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
const MIN_CLUSTER_SIZE = 10

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

  const countVal = (g, v) => g.reduce((n, c) => n + (c === v ? 1 : 0), 0)
  console.log(`  Walls: ${countVal(grid, 1)}, Free: ${countVal(grid, 2)}`)

  console.log('Removing small noise clusters...')
  removeSmallClusters(grid, width, height)
  console.log(`  Walls after cleanup: ${countVal(grid, 1)}`)

  console.log('Morphological closing...')
  grid = morphClose(grid, width, height)
  console.log(`  Walls after closing: ${countVal(grid, 1)}`)

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

export const MAP_RESOLUTION = ${RESOLUTION}
export const mapWidth = ${mapWidth}
export const mapDepth = ${mapDepth}

export const wallRects: WallRect[] = ${JSON.stringify(wallRects)}

export const floorRects: WallRect[] = ${JSON.stringify(floorRects)}
`

  const outPath = resolve(ROOT, 'src', 'data', 'mapData.ts')
  writeFileSync(outPath, ts, 'utf-8')
  console.log(`\nWrote ${outPath}`)
  console.log(`  wallRects: ${wallRects.length}`)
  console.log(`  floorRects: ${floorRects.length}`)
}

main()
