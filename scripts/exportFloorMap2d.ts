/**
 * 3D FloorPolygonMesh와 동일한 바닥(외곽 폴리곤 + 수동 클립) + 본편 책장을 위에서 본 2D PNG로 내보냅니다.
 * 실행: npx tsx scripts/exportFloorMap2d.ts [--out path] [--width 2048]
 *
 * 색: `src/data/map2dPngPalette.ts` — 3D 재질 알베도와 동일 계열, 전체 보기 조명 체감에 맞게 어둡게 보정.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { getMinimapWorldBounds } from '../src/utils/minimapBounds'
import { createFloorPointInclusionTest } from '../src/utils/floorPolygon'
import { bookshelfInstances, bookshelfPolygons, floorFillRects, wallPolylines } from '../src/data/floorPlan'
import { MAP2D_PNG, hexToRgba } from '../src/data/map2dPngPalette'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const BG = hexToRgba(MAP2D_PNG.bg)
const FLOOR = hexToRgba(MAP2D_PNG.floor)
const BOOKSHELF = hexToRgba(MAP2D_PNG.bookshelf)

function parseArgs() {
  const argv = process.argv.slice(2)
  let out = resolve(ROOT, 'public', 'map-floor-2d.png')
  let width = 2048
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out = resolve(argv[++i])
    } else if (argv[i] === '--width' && argv[i + 1]) {
      width = Math.max(64, Math.floor(Number(argv[++i])))
    }
  }
  return { out, width }
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

/** RotatedFixtureInstances와 동일: 로컬 w×d를 yaw로 회전한 네 꼭짓점 (XZ). */
function rotatedBookshelfCorners(cx: number, cz: number, w: number, d: number, yaw: number): [number, number][] {
  const hw = w * 0.5
  const hd = d * 0.5
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  return corners.map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c])
}

function fixtureListToQuads(
  list: { cx: number; cz: number; w: number; d: number; yaw: number }[],
): [number, number][][] {
  return list.map((b) => rotatedBookshelfCorners(b.cx, b.cz, b.w, b.d, b.yaw))
}

async function main() {
  const { out, width: W } = parseArgs()
  const { minX, maxX, minZ, maxZ, spanX, spanZ } = getMinimapWorldBounds()
  const H = Math.max(1, Math.round((W * spanZ) / spanX))

  const floorTest = createFloorPointInclusionTest(wallPolylines, floorFillRects)
  const mainShelfQuads = fixtureListToQuads(bookshelfInstances)

  const buf = Buffer.alloc(W * H * 4)

  for (let v = 0; v < H; v++) {
    const z = maxZ - ((v + 0.5) / H) * spanZ
    const row = v * W * 4
    for (let u = 0; u < W; u++) {
      const x = minX + ((u + 0.5) / W) * spanX
      let color = BG
      if (floorTest(x, z)) color = FLOOR
      for (const quad of mainShelfQuads) {
        if (pointInPolygon2D(x, z, quad)) color = BOOKSHELF
      }
      for (const poly of bookshelfPolygons) {
        if (pointInPolygon2D(x, z, poly)) color = BOOKSHELF
      }
      const o = row + u * 4
      buf[o] = color.r
      buf[o + 1] = color.g
      buf[o + 2] = color.b
      buf[o + 3] = color.alpha
    }
  }

  mkdirSync(dirname(out), { recursive: true })
  const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
  writeFileSync(out, png)
  console.log(
    `Wrote ${out} (${W}×${H} px, world X[${minX.toFixed(2)}, ${maxX.toFixed(2)}] Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}], shelves=${Math.max(mainShelfQuads.length, bookshelfPolygons.length)})`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
