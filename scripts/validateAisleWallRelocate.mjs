import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import {
  shelfOpenSignTowardCorridor,
} from './aisleWallRelocateCore.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const LAYER_PATH = resolve(ROOT, 'src', 'data', 'bookshelfOverlayLayer.ts')
const MAP_PATH = resolve(ROOT, 'src', 'data', 'mapData.ts')
const OUT_PATH = resolve(ROOT, 'map_info', 'aisle_wall_relocate_validation.png')

const layerSource = readFileSync(LAYER_PATH, 'utf-8')
const shelfMatch = layerSource.match(/const KEEPOUT_MASK_BOOKSHELVES:[^\n]+ = (\[.*\])\n/)
if (!shelfMatch) throw new Error(`Could not parse shelves from ${LAYER_PATH}`)
const shelves = JSON.parse(shelfMatch[1])

const mapSource = readFileSync(MAP_PATH, 'utf-8')
const loopMatch = mapSource.match(/export const wallPolylines: Point2\[\]\[\] = (\[\[\[.*\]\]\])/)
if (!loopMatch) throw new Error(`Could not parse wallPolylines from ${MAP_PATH}`)
const wallLoops = JSON.parse(loopMatch[1])

const isWalkable = () => true

const panelW = 900
const panelH = 700
const xs = shelves.flatMap(s => s.footprint.map(p => p[0]))
const zs = shelves.flatMap(s => s.footprint.map(p => p[1]))
const minX = Math.min(...xs) - 2
const maxX = Math.max(...xs) + 2
const minZ = Math.min(...zs) - 2
const maxZ = Math.max(...zs) + 2
const scale = Math.min((panelW - 40) / (maxX - minX), (panelH - 40) / (maxZ - minZ))

function project(x, z) {
  return [
    20 + (x - minX) * scale,
    20 + (maxZ - z) * scale,
  ]
}

const polys = []
for (const shelf of shelves) {
  const openSign = shelfOpenSignTowardCorridor(shelf.cx, shelf.cz, shelf.yaw, wallLoops, isWalkable)
  const pts = shelf.footprint.map(p => project(p[0], p[1]).map(v => v.toFixed(1)).join(',')).join(' ')
  polys.push(`<polygon points="${pts}" fill="#000" fill-opacity="0.35" stroke="#333"/>`)
  const c = project(shelf.cx, shelf.cz)
  const dir = project(
    shelf.cx + openSign * Math.sin(shelf.yaw) * 0.6,
    shelf.cz + openSign * Math.cos(shelf.yaw) * 0.6,
  )
  polys.push(`<line x1="${c[0]}" y1="${c[1]}" x2="${dir[0]}" y2="${dir[1]}" stroke="#d81b60" stroke-width="2"/>`)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${panelH}" viewBox="0 0 ${panelW} ${panelH}">
<rect width="100%" height="100%" fill="#f7f7f7"/>
<text x="20" y="18" font-family="Arial" font-size="14">keepout shelves=${shelves.length}, red arrow=corridor(open) direction</text>
${polys.join('\n')}
</svg>`

await sharp(Buffer.from(svg)).png().toFile(OUT_PATH)
writeFileSync(resolve(ROOT, 'map_info', 'aisle_wall_relocate_validation.svg'), svg, 'utf-8')
console.log(`wrote ${OUT_PATH}`)
console.log(`shelves=${shelves.length} (post-relocate stats: run node scripts/processMap.mjs)`)
