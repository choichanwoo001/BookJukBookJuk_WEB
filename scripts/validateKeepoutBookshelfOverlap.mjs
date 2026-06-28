import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve(import.meta.dirname, '..')
const LAYER_PATH = resolve(ROOT, 'src', 'data', 'bookshelfOverlayLayer.ts')
const OUT_PATH = resolve(ROOT, 'map_info', 'keepout_bookshelf_overlap_validation.png')

const source = readFileSync(LAYER_PATH, 'utf-8')
const match = source.match(/const KEEPOUT_MASK_BOOKSHELVES:[^\n]+ = (\[.*\])/)
if (!match) throw new Error(`Could not parse KEEPOUT_MASK_BOOKSHELVES from ${LAYER_PATH}`)

const shelves = JSON.parse(match[1])

function normalizeAnglePi(angle) {
  let a = angle
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function axisDiffPi(a, b) {
  let d = normalizeAnglePi(a - b)
  if (d > Math.PI / 2) d -= Math.PI
  if (d < -Math.PI / 2) d += Math.PI
  return Math.abs(d)
}

function footprintOrientedAngle(points) {
  let best = null
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    if (len <= 1e-6) continue

    const angle = Math.atan2(dz, dx)
    const cosT = dx / len
    const sinT = dz / len
    let minU = Infinity, maxU = -Infinity
    let minV = Infinity, maxV = -Infinity
    for (const p of points) {
      const u = p[0] * cosT + p[1] * sinT
      const v = -p[0] * sinT + p[1] * cosT
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }

    const w = maxU - minU
    const d = maxV - minV
    const area = w * d
    if (!best || area < best.area) best = { area, angle: d > w ? angle + Math.PI / 2 : angle }
  }
  return normalizeAnglePi(best?.angle ?? 0)
}

function renderedCorners(shelf) {
  const hw = shelf.w * 0.5
  const hd = shelf.d * 0.5
  const c = Math.cos(shelf.yaw)
  const s = Math.sin(shelf.yaw)
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => [
    shelf.cx + lx * c + lz * s,
    shelf.cz - lx * s + lz * c,
  ])
}

const renderedPolygons = shelves.map(renderedCorners)
const allPoints = shelves.flatMap(s => [...s.footprint, ...renderedCorners(s)])
const minX = Math.min(...allPoints.map(p => p[0])) - 1
const maxX = Math.max(...allPoints.map(p => p[0])) + 1
const minZ = Math.min(...allPoints.map(p => p[1])) - 1
const maxZ = Math.max(...allPoints.map(p => p[1])) + 1

const panelW = 520
const panelH = 300
const gap = 24
const labelH = 42
const rowGap = 34
const pad = 22
const scale = Math.min(
  (panelW - pad * 2) / (maxX - minX),
  (panelH - pad * 2) / (maxZ - minZ),
)
const totalW = panelW * 3 + gap * 2
const totalH = (panelH + labelH) * 2 + rowGap

function project([x, z], ox, oy) {
  return [
    ox + pad + (x - minX) * scale,
    oy + labelH + pad + (maxZ - z) * scale,
  ]
}

function polygon(points, ox, oy, attrs) {
  const p = points.map(pt => project(pt, ox, oy).map(v => v.toFixed(1)).join(',')).join(' ')
  return `<polygon points="${p}" ${attrs}/>`
}

function label(text, ox, oy) {
  return `<text x="${ox + 10}" y="${oy + 24}" font-family="Arial, sans-serif" font-size="18" fill="#111">${text}</text>`
}

function panelFrame(ox, oy) {
  return `<rect x="${ox}" y="${oy}" width="${panelW}" height="${panelH + labelH}" fill="#fff" stroke="#ddd"/>`
}

let maxAngleDiff = 0
for (const shelf of shelves) {
  const keepoutAngle = footprintOrientedAngle(shelf.footprint)
  const renderedAngle = Math.atan2(-Math.sin(shelf.yaw), Math.cos(shelf.yaw))
  maxAngleDiff = Math.max(maxAngleDiff, axisDiffPi(keepoutAngle, renderedAngle))
}

const panels = []
for (let row = 0; row < 2; row++) {
  const oy = row * (panelH + labelH + rowGap)
  for (let col = 0; col < 3; col++) {
    panels.push(panelFrame(col * (panelW + gap), oy))
  }
}

const topY = 0
const bottomY = panelH + labelH + rowGap
panels.push(label('keepout footprint', 0, topY))
panels.push(label('generated polygon', panelW + gap, topY))
panels.push(label('exact overlap compare', (panelW + gap) * 2, topY))
panels.push(label('keepout footprint', 0, bottomY))
panels.push(label('rendered 3D box footprint', panelW + gap, bottomY))
panels.push(label(`direction overlay, max diff ${(maxAngleDiff * 180 / Math.PI).toFixed(3)} deg`, (panelW + gap) * 2, bottomY))

for (const shelf of shelves) {
  panels.push(polygon(shelf.footprint, 0, topY, 'fill="#000"'))
  panels.push(polygon(shelf.footprint, panelW + gap, topY, 'fill="#000"'))
  panels.push(polygon(shelf.footprint, (panelW + gap) * 2, topY, 'fill="#000"'))

  panels.push(polygon(shelf.footprint, 0, bottomY, 'fill="#000"'))
}

for (const poly of renderedPolygons) {
  panels.push(polygon(poly, panelW + gap, bottomY, 'fill="#000"'))
  panels.push(polygon(poly, (panelW + gap) * 2, bottomY, 'fill="none" stroke="#d81b60" stroke-width="2"'))
}
for (const shelf of shelves) {
  panels.push(polygon(shelf.footprint, (panelW + gap) * 2, bottomY, 'fill="#000" fill-opacity="0.88"'))
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
<rect width="100%" height="100%" fill="#f7f7f7"/>
${panels.join('\n')}
</svg>`

await sharp(Buffer.from(svg)).png().toFile(OUT_PATH)
writeFileSync(resolve(ROOT, 'map_info', 'keepout_bookshelf_overlap_validation.svg'), svg, 'utf-8')

console.log(`wrote ${OUT_PATH}`)
console.log(`shelves=${shelves.length}`)
console.log(`max direction diff deg=${(maxAngleDiff * 180 / Math.PI).toFixed(6)}`)
