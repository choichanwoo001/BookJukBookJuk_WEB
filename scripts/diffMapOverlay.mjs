/**
 * Compare two same-size map PNGs (grayscale occupancy style).
 *
 * Usage:
 *   node scripts/diffMapOverlay.mjs --base ver0_1.png --target ver2_1.png [--out diff-overlay.png]
 *   node scripts/diffMapOverlay.mjs --base ver0_1.png --target ver2_1.png --write-web
 *
 * --write-web writes public/map-diff-overlay.png (RGBA, transparent except black diff on floor).
 * Placement uses mapData.ts MAP_IMAGE_* and mapImageOffset* (same as processMap).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const WEB_PNG = resolve(ROOT, 'public', 'map-diff-overlay.png')
const MAP_DATA_TS = resolve(ROOT, 'src', 'data', 'mapData.ts')

function readMapImageSizeFromMapData() {
  const s = readFileSync(MAP_DATA_TS, 'utf-8')
  const w = /export const MAP_IMAGE_WIDTH_PX = (\d+)/.exec(s)
  const h = /export const MAP_IMAGE_HEIGHT_PX = (\d+)/.exec(s)
  if (!w || !h) {
    throw new Error('mapData.ts must export MAP_IMAGE_WIDTH_PX / MAP_IMAGE_HEIGHT_PX (run processMap or add by hand)')
  }
  return { width: Number(w[1]), height: Number(h[1]) }
}

function parseArgs(argv) {
  const args = {
    base: null,
    target: null,
    out: null,
    diffMin: 8,
    floorMin: 230,
    writeWeb: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--base') args.base = argv[++i]
    if (t === '--target') args.target = argv[++i]
    if (t === '--out') args.out = argv[++i]
    if (t === '--diff-min') args.diffMin = Number(argv[++i])
    if (t === '--floor-min') args.floorMin = Number(argv[++i])
    if (t === '--write-web') args.writeWeb = true
  }
  if (!args.base || !args.target) {
    throw new Error(
      'Usage: node scripts/diffMapOverlay.mjs --base <a.png> --target <b.png> [--out out.png] [--write-web]',
    )
  }
  return args
}

async function readGray(path) {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) }
}

async function main() {
  const args = parseArgs(process.argv)
  const basePath = resolve(ROOT, args.base)
  const targetPath = resolve(ROOT, args.target)
  const [base, target] = await Promise.all([readGray(basePath), readGray(targetPath)])
  if (base.width !== target.width || base.height !== target.height) {
    throw new Error(`Size mismatch: ${base.width}x${base.height} vs ${target.width}x${target.height}`)
  }

  if (args.writeWeb) {
    const expected = readMapImageSizeFromMapData()
    if (base.width !== expected.width || base.height !== expected.height) {
      throw new Error(
        `Input PNG ${base.width}x${base.height} must match mapData MAP_IMAGE_* ${expected.width}x${expected.height}`,
      )
    }
  }

  const { width, height } = base
  const n = base.pixels.length
  const diffMin = args.diffMin
  const floorMin = args.floorMin

  let diffOnFloor = 0
  let diffTotal = 0

  const rgba = Buffer.alloc(n * 4)
  const rgb = Buffer.alloc(n * 3)

  for (let i = 0; i < n; i++) {
    const a = base.pixels[i]
    const b = target.pixels[i]
    const d = Math.abs(a - b)
    const onFloor = a >= floorMin && b >= floorMin
    if (d >= diffMin) {
      diffTotal++
      if (onFloor) diffOnFloor++
    }

    const v = a
    const o3 = i * 3
    rgb[o3] = v
    rgb[o3 + 1] = v
    rgb[o3 + 2] = v

    const o4 = i * 4
    if (d >= diffMin && onFloor) {
      rgb[o3] = 0
      rgb[o3 + 1] = 0
      rgb[o3 + 2] = 0
      rgba[o4] = 0
      rgba[o4 + 1] = 0
      rgba[o4 + 2] = 0
      rgba[o4 + 3] = 235
    } else {
      rgba[o4] = 0
      rgba[o4 + 1] = 0
      rgba[o4 + 2] = 0
      rgba[o4 + 3] = 0
    }
  }

  const { default: sharp } = await import('sharp')

  if (args.out) {
    const outPath = resolve(ROOT, args.out)
    await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toFile(outPath)
    console.log(`Wrote ${outPath}`)
  }

  if (args.writeWeb) {
    mkdirSync(dirname(WEB_PNG), { recursive: true })
    await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(WEB_PNG)
    console.log(`Wrote ${WEB_PNG}`)
  }

  console.log(`Pixels with |Δ|>=${diffMin}: ${diffTotal} (on floor both>=${floorMin}: ${diffOnFloor}) / ${n}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
