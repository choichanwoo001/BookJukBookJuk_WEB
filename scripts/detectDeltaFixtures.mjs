import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DEFAULT_OUTPUT_PATH = resolve(ROOT, 'src', 'data', 'detectedFixtures.ts')
const MAP_DATA_PATH = resolve(ROOT, 'src', 'data', 'mapData.ts')
const DEFAULT_HEIGHT = 2.34

function parseArgs(argv) {
  const args = {
    base: null,
    target: null,
    output: DEFAULT_OUTPUT_PATH,
    debugDir: null,
    minArea: 24,
    diffThreshold: null,
  }
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--base') args.base = argv[i + 1]
    if (token === '--target') args.target = argv[i + 1]
    if (token === '--output') args.output = resolve(ROOT, argv[i + 1])
    if (token === '--debug-dir') args.debugDir = resolve(ROOT, argv[i + 1])
    if (token === '--min-area') args.minArea = Number(argv[i + 1])
    if (token === '--diff-threshold') args.diffThreshold = Number(argv[i + 1])
  }
  if (!args.base || !args.target) {
    throw new Error('Usage: node scripts/detectDeltaFixtures.mjs --base <image> --target <image>')
  }
  if (!Number.isFinite(args.minArea) || args.minArea < 1) {
    throw new Error('--min-area must be a positive number')
  }
  if (args.diffThreshold !== null && (!Number.isFinite(args.diffThreshold) || args.diffThreshold < 1 || args.diffThreshold > 255)) {
    throw new Error('--diff-threshold must be within 1..255')
  }
  return args
}

function parseNumberExport(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([0-9.+-]+)`))
  if (!match) throw new Error(`Could not parse ${name} from mapData.ts`)
  return Number(match[1])
}

function parseArrayExport(source, name) {
  const match = source.match(new RegExp(`export const ${name}[^=]*= (.+)\\r?\\n`))
  if (!match) throw new Error(`Could not parse ${name} from mapData.ts`)
  return JSON.parse(match[1])
}

function computeWorldBoundsFromMapData(source) {
  const wallRects = parseArrayExport(source, 'wallRects')
  const floorRects = parseArrayExport(source, 'floorRects')
  const pillarRects = parseArrayExport(source, 'pillarRects')
  const bookshelfRects = parseArrayExport(source, 'bookshelfRects')
  const all = [...wallRects, ...floorRects, ...pillarRects, ...bookshelfRects]
  if (all.length === 0) throw new Error('mapData.ts has no geometry to derive world bounds')
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const r of all) {
    minX = Math.min(minX, r.cx - r.w / 2)
    maxX = Math.max(maxX, r.cx + r.w / 2)
    minZ = Math.min(minZ, r.cz - r.d / 2)
    maxZ = Math.max(maxZ, r.cz + r.d / 2)
  }
  return {
    mapWidth: parseNumberExport(source, 'mapWidth'),
    mapDepth: parseNumberExport(source, 'mapDepth'),
    minX,
    maxX,
    minZ,
    maxZ,
  }
}

async function readGrayImage(path) {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(path)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) }
}

function percentile(values, q) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)))
  return sorted[idx]
}

function buildAbsDiff(a, b) {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = Math.abs(a[i] - b[i])
  return out
}

function thresholdMask(values, threshold) {
  const out = new Uint8Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] >= threshold ? 1 : 0
  return out
}

function binaryOpen(mask, width, height) {
  return dilate(erode(mask, width, height), width, height)
}

function binaryClose(mask, width, height) {
  return erode(dilate(mask, width, height), width, height)
}

function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (mask[ny * width + nx]) {
            on = 1
            break
          }
        }
      }
      out[y * width + x] = on
    }
  }
  return out
}

function erode(mask, width, height) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 1
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            on = 0
            break
          }
        }
      }
      out[y * width + x] = on
    }
  }
  return out
}

function extractComponents(mask, width, height) {
  const labels = new Int32Array(mask.length)
  const components = []
  let nextLabel = 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!mask[start] || labels[start] !== 0) continue
      const stack = [start]
      const indices = []
      let minX = x, maxX = x, minY = y, maxY = y
      while (stack.length > 0) {
        const idx = stack.pop()
        if (labels[idx] !== 0 || !mask[idx]) continue
        labels[idx] = nextLabel
        indices.push(idx)
        const cx = idx % width
        const cy = (idx - cx) / width
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        if (cx > 0) stack.push(idx - 1)
        if (cx < width - 1) stack.push(idx + 1)
        if (cy > 0) stack.push(idx - width)
        if (cy < height - 1) stack.push(idx + width)
      }
      const bboxW = maxX - minX + 1
      const bboxH = maxY - minY + 1
      components.push({
        label: nextLabel,
        indices,
        size: indices.length,
        minX,
        maxX,
        minY,
        maxY,
        bboxW,
        bboxH,
      })
      nextLabel++
    }
  }
  return { labels, components }
}

function computeObb(component, width) {
  const n = component.indices.length
  if (n < 2) {
    return {
      centerX: component.minX + component.bboxW / 2,
      centerY: component.minY + component.bboxH / 2,
      axisU: [1, 0],
      axisV: [0, 1],
      extentU: component.bboxW,
      extentV: component.bboxH,
      angle: 0,
    }
  }
  let sumCol = 0
  let sumRow = 0
  for (const idx of component.indices) {
    const col = idx % width
    const row = (idx - col) / width
    sumCol += col
    sumRow += row
  }
  const meanCol = sumCol / n
  const meanRow = sumRow / n
  let scc = 0, srr = 0, scr = 0
  for (const idx of component.indices) {
    const col = idx % width
    const row = (idx - col) / width
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
    const col = idx % width
    const row = (idx - col) / width
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
  return {
    centerX: meanCol + centerU * cosT - centerV * sinT,
    centerY: meanRow + centerU * sinT + centerV * cosT,
    axisU: [cosT, sinT],
    axisV: [-sinT, cosT],
    extentU: maxU - minU + 1,
    extentV: maxV - minV + 1,
    angle: -thetaPx,
  }
}

function computeMaskBounds(mask, width, height) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 }
  }
  return { minX, maxX, minY, maxY }
}

function sampleEdgeContact(p0, p1, edgeMask, width, height) {
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const len = Math.hypot(dx, dy)
  const n = Math.max(4, Math.ceil(len))
  if (len < 1e-6) return 0
  const nx = -dy / len
  const ny = dx / len
  let hitsPlus = 0
  let hitsMinus = 0
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = p0[0] + dx * t
    const y = p0[1] + dy * t
    for (const off of [2, 3]) {
      const xp = Math.round(x + nx * off)
      const yp = Math.round(y + ny * off)
      const xm = Math.round(x - nx * off)
      const ym = Math.round(y - ny * off)
      if (xp >= 0 && yp >= 0 && xp < width && yp < height && edgeMask[yp * width + xp]) hitsPlus++
      if (xm >= 0 && ym >= 0 && xm < width && ym < height && edgeMask[ym * width + xm]) hitsMinus++
    }
  }
  const denom = (n + 1) * 2
  return Math.max(hitsPlus / denom, hitsMinus / denom)
}

function normalizeAngle(rad) {
  let a = rad
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function toRounded(value, digits) {
  const p = 10 ** digits
  return Math.round(value * p) / p
}

function toTsModule({ source, image, fixtures }) {
  return `// Auto-generated by scripts/detectDeltaFixtures.mjs
// Source: ${source.base} -> ${source.target}
// Run: node scripts/detectDeltaFixtures.mjs --base <base.png> --target <target.png>

export type DetectedFixtureKind = 'bookshelf' | 'counter' | 'displayLow'

export type DetectedFixture = {
  kind: DetectedFixtureKind
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
  score?: number
  sourceClass?: string
}

export const DETECTED_FIXTURE_SOURCE = ${JSON.stringify(`${source.base} -> ${source.target}`)}
export const DETECTED_IMAGE_SIZE = ${JSON.stringify(image)}
export const detectedFixtures: DetectedFixture[] = ${JSON.stringify(fixtures)}
`
}

async function writeDebugMask(path, mask, width, height) {
  const { default: sharp } = await import('sharp')
  const data = Buffer.from(mask.map(v => (v ? 255 : 0)))
  await sharp(data, { raw: { width, height, channels: 1 } }).png().toFile(path)
}

async function main() {
  const args = parseArgs(process.argv)
  const basePath = resolve(ROOT, args.base)
  const targetPath = resolve(ROOT, args.target)
  const [base, target] = await Promise.all([readGrayImage(basePath), readGrayImage(targetPath)])
  if (base.width !== target.width || base.height !== target.height) {
    throw new Error(`Image size mismatch: base=${base.width}x${base.height}, target=${target.width}x${target.height}`)
  }
  const width = base.width
  const height = base.height

  const mapDataSource = readFileSync(MAP_DATA_PATH, 'utf-8')
  const world = computeWorldBoundsFromMapData(mapDataSource)

  const absDiff = buildAbsDiff(base.pixels, target.pixels)
  const autoDiffThreshold = Math.max(16, percentile(absDiff, 0.985))
  const diffThreshold = args.diffThreshold ?? autoDiffThreshold
  let diffMask = thresholdMask(absDiff, diffThreshold)
  diffMask = binaryClose(binaryOpen(diffMask, width, height), width, height)

  const darkThreshold = Math.min(110, percentile(base.pixels, 0.12))
  const wallEdgeMask = new Uint8Array(base.pixels.length)
  for (let i = 0; i < base.pixels.length; i++) wallEdgeMask[i] = base.pixels[i] <= darkThreshold ? 1 : 0

  const backgroundValue = percentile(base.pixels, 0.55)
  const mapPixelMask = new Uint8Array(base.pixels.length)
  for (let i = 0; i < base.pixels.length; i++) {
    mapPixelMask[i] = Math.abs(base.pixels[i] - backgroundValue) >= 8 ? 1 : 0
  }
  const mapPxBounds = computeMaskBounds(binaryClose(mapPixelMask, width, height), width, height)
  const pxSpanX = Math.max(1, mapPxBounds.maxX - mapPxBounds.minX + 1)
  const pxSpanY = Math.max(1, mapPxBounds.maxY - mapPxBounds.minY + 1)
  const scaleX = (world.maxX - world.minX) / pxSpanX
  const scaleZ = (world.maxZ - world.minZ) / pxSpanY

  const { components } = extractComponents(diffMask, width, height)
  const fixtures = []
  const debugAccepted = new Uint8Array(width * height)

  for (const comp of components) {
    if (comp.size < args.minArea) continue
    const obb = computeObb(comp, width)
    const rectArea = Math.max(1, obb.extentU * obb.extentV)
    const rectScore = comp.size / rectArea
    const halfU = obb.extentU * 0.5
    const halfV = obb.extentV * 0.5
    const corners = [
      [obb.centerX - obb.axisU[0] * halfU - obb.axisV[0] * halfV, obb.centerY - obb.axisU[1] * halfU - obb.axisV[1] * halfV],
      [obb.centerX + obb.axisU[0] * halfU - obb.axisV[0] * halfV, obb.centerY + obb.axisU[1] * halfU - obb.axisV[1] * halfV],
      [obb.centerX + obb.axisU[0] * halfU + obb.axisV[0] * halfV, obb.centerY + obb.axisU[1] * halfU + obb.axisV[1] * halfV],
      [obb.centerX - obb.axisU[0] * halfU + obb.axisV[0] * halfV, obb.centerY - obb.axisU[1] * halfU + obb.axisV[1] * halfV],
    ]
    const edgeRatios = [
      sampleEdgeContact(corners[0], corners[1], wallEdgeMask, width, height),
      sampleEdgeContact(corners[1], corners[2], wallEdgeMask, width, height),
      sampleEdgeContact(corners[2], corners[3], wallEdgeMask, width, height),
      sampleEdgeContact(corners[3], corners[0], wallEdgeMask, width, height),
    ]
    const contactedEdges = edgeRatios.filter(v => v >= 0.7).length
    const isRect = rectScore >= 0.67
    const isThreeEdgeShelf = rectScore >= 0.38 && contactedEdges >= 3
    if (!isRect && !isThreeEdgeShelf) continue

    const nx = (obb.centerX - mapPxBounds.minX) / pxSpanX
    const nz = (obb.centerY - mapPxBounds.minY) / pxSpanY
    const cx = world.minX + nx * (world.maxX - world.minX)
    const cz = world.maxZ - nz * (world.maxZ - world.minZ)

    const worldUdx = obb.axisU[0] * scaleX
    const worldUdz = -obb.axisU[1] * scaleZ
    const worldVdx = obb.axisV[0] * scaleX
    const worldVdz = -obb.axisV[1] * scaleZ
    const extentUWorld = Math.hypot(worldUdx, worldUdz) * obb.extentU
    const extentVWorld = Math.hypot(worldVdx, worldVdz) * obb.extentV
    const longSide = Math.max(extentUWorld, extentVWorld)
    const shortSide = Math.min(extentUWorld, extentVWorld)
    if (shortSide < 0.18 || shortSide > 2.8 || longSide < 0.3 || longSide > 4.2) continue

    const yawRaw = extentUWorld >= extentVWorld
      ? Math.atan2(worldUdz, worldUdx)
      : Math.atan2(worldVdz, worldVdx)

    fixtures.push({
      kind: 'bookshelf',
      cx: toRounded(cx, 3),
      cz: toRounded(cz, 3),
      w: toRounded(longSide, 3),
      d: toRounded(shortSide, 3),
      yaw: toRounded(normalizeAngle(yawRaw), 4),
      h: DEFAULT_HEIGHT,
      score: toRounded(Math.max(rectScore, contactedEdges / 4), 4),
      sourceClass: isRect ? 'delta-rect' : 'delta-3edge',
    })

    for (const idx of comp.indices) debugAccepted[idx] = 1
  }

  fixtures.sort((a, b) => {
    if (a.cz !== b.cz) return b.cz - a.cz
    return a.cx - b.cx
  })

  const tsModule = toTsModule({
    source: { base: args.base, target: args.target },
    image: { width, height },
    fixtures,
  })
  writeFileSync(args.output, tsModule, 'utf-8')
  console.log(`Wrote ${args.output}`)
  console.log(`Detected fixtures: ${fixtures.length} (components=${components.length}, diffThreshold=${diffThreshold}, mapWidth=${world.mapWidth}, mapDepth=${world.mapDepth})`)

  if (args.debugDir) {
    mkdirSync(args.debugDir, { recursive: true })
    await writeDebugMask(resolve(args.debugDir, 'diff-mask.png'), diffMask, width, height)
    await writeDebugMask(resolve(args.debugDir, 'accepted-mask.png'), debugAccepted, width, height)
    await writeDebugMask(resolve(args.debugDir, 'wall-edge-mask.png'), wallEdgeMask, width, height)
    console.log(`Wrote debug masks to ${args.debugDir}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
