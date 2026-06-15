/** @typedef {{ cx: number, cz: number, w: number, d: number, yaw: number, footprint?: number[][] }} KeepoutShelf */
/** @typedef {{ label: number, size: number, indices: number[], minX: number, maxX: number, minY: number, maxY: number, bboxW: number, bboxH: number, fillRatio: number, aspect: number, touchesBoundary: boolean }} WallComponent */

export const WALL = 1
export const FREE = 2
export const WALL_HALF_M = 0.08
export const AISLE_CORRIDOR_MARGIN_M = 0.15
export const AISLE_WIDTH_MARGIN_M = 0.12
export const THIN_PARTITION_MAX_SMALL_SIDE_M = 0.25
export const THIN_PARTITION_MIN_ASPECT = 3

function projectOntoSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax
  const abz = bz - az
  const abLenSq = abx * abx + abz * abz
  if (abLenSq < 1e-12) return { qx: ax, qz: az }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq))
  return { qx: ax + t * abx, qz: az + t * abz }
}

export function closestWallSegmentToPoint(px, pz, loops) {
  let bestDistSq = Infinity
  let bestX = 0
  let bestZ = 0
  let bestAx = 0
  let bestAz = 0
  let bestBx = 0
  let bestBz = 0

  for (const loop of loops) {
    if (loop.length < 2) continue
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const { qx, qz } = projectOntoSegment2D(px, pz, a[0], a[1], b[0], b[1])
      const d = (px - qx) ** 2 + (pz - qz) ** 2
      if (d < bestDistSq) {
        bestDistSq = d
        bestX = qx
        bestZ = qz
        bestAx = a[0]
        bestAz = a[1]
        bestBx = b[0]
        bestBz = b[1]
      }
    }
  }

  if (bestDistSq === Infinity) return null
  return { x: bestX, z: bestZ, ax: bestAx, az: bestAz, bx: bestBx, bz: bestBz }
}

export function inwardNormalTowardWalkableFloor(hit, hintCx, hintCz, isWalkable) {
  const dx = hit.bx - hit.ax
  const dz = hit.bz - hit.az
  const len = Math.hypot(dx, dz)
  if (len < 1e-12) return { nx: 0, nz: 1 }

  const nx1 = -dz / len
  const nz1 = dx / len
  const nx2 = dz / len
  const nz2 = -dx / len

  const eps = 0.18
  const t1 = isWalkable(hit.x + nx1 * eps, hit.z + nz1 * eps)
  const t2 = isWalkable(hit.x + nx2 * eps, hit.z + nz2 * eps)

  const dot1 = (hintCx - hit.x) * nx1 + (hintCz - hit.z) * nz1
  const dot2 = (hintCx - hit.x) * nx2 + (hintCz - hit.z) * nz2

  if (t1 && !t2) return { nx: nx1, nz: nz1 }
  if (t2 && !t1) return { nx: nx2, nz: nz2 }
  return dot1 >= dot2 ? { nx: nx1, nz: nz1 } : { nx: nx2, nz: nz2 }
}

export function snapBookshelfCenterFlushToWall(cx, cz, _yaw, d, loops, isWalkable) {
  const hit = closestWallSegmentToPoint(cx, cz, loops)
  if (!hit) return { cx, cz, yaw: _yaw }

  const { nx, nz } = inwardNormalTowardWalkableFloor(hit, cx, cz, isWalkable)
  const half = d * 0.5
  return {
    cx: hit.x + nx * half,
    cz: hit.z + nz * half,
    yaw: Math.atan2(nx, nz),
  }
}

/** +1 when local +Z opens toward walkable floor; -1 when a Z mirror is needed. */
export function shelfOpenSignTowardCorridor(cx, cz, yaw, loops, isWalkable) {
  const { yaw: corridorYaw } = snapBookshelfCenterFlushToWall(cx, cz, yaw, 0.5, loops, isWalkable)
  const dot =
    Math.sin(yaw) * Math.sin(corridorYaw) +
    Math.cos(yaw) * Math.cos(corridorYaw)
  return dot < 0 ? -1 : 1
}

export function shelfCorridorNormal(yaw, openSign) {
  return {
    nx: openSign * Math.sin(yaw),
    nz: openSign * Math.cos(yaw),
  }
}

export function shelfBackNormal(yaw, openSign) {
  const { nx, nz } = shelfCorridorNormal(yaw, openSign)
  return { nx: -nx, nz: -nz }
}

export function worldToShelfLocal(px, pz, shelf) {
  const dx = px - shelf.cx
  const dy = pz - shelf.cz
  const c = Math.cos(shelf.yaw)
  const s = Math.sin(shelf.yaw)
  return {
    lx: dx * c - dy * s,
    lz: dx * s + dy * c,
  }
}

export function pointInPolygon(px, py, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersects = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / Math.max(1e-9, yj - yi) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

export function isPointInShelfFootprint(px, pz, shelf) {
  if (!shelf.footprint || shelf.footprint.length < 3) return false
  return pointInPolygon(px, pz, shelf.footprint)
}

export function isPointInShelfAisleZone(px, pz, shelf, openSign) {
  const { lx, lz } = worldToShelfLocal(px, pz, shelf)
  const halfW = shelf.w * 0.5 + AISLE_WIDTH_MARGIN_M
  if (Math.abs(lx) > halfW) return false
  return lz * openSign > -shelf.d * 0.5 + AISLE_CORRIDOR_MARGIN_M
}

export function isPointInAnyShelfAisleZone(px, pz, shelves, loops, isWalkable) {
  for (const shelf of shelves) {
    const openSign = shelfOpenSignTowardCorridor(shelf.cx, shelf.cz, shelf.yaw, loops, isWalkable)
    if (isPointInShelfFootprint(px, pz, shelf)) return true
    if (isPointInShelfAisleZone(px, pz, shelf, openSign)) return true
  }
  return false
}

export function componentCentroidApp(component, width, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  let sumX = 0
  let sumZ = 0
  for (const idx of component.indices) {
    const col = idx % width
    const row = (idx - col) / width
    const wx = originX + col * resolution
    const wz = originY + (imgHeight - 1 - row) * resolution
    sumX += wx - offsetX
    sumZ += wz - offsetZ
  }
  const n = component.indices.length
  return { cx: sumX / n, cz: sumZ / n }
}

export function isThinPartitionComponent(component, resolution) {
  const widthM = component.bboxW * resolution
  const depthM = component.bboxH * resolution
  const smallSide = Math.min(widthM, depthM)
  const longSide = Math.max(widthM, depthM)
  const aspect = longSide / Math.max(1e-6, smallSide)
  return aspect >= THIN_PARTITION_MIN_ASPECT || smallSide <= THIN_PARTITION_MAX_SMALL_SIDE_M
}

export function shouldRelocateWallComponent(component, shelves, loops, isWalkable, width, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  if (component.touchesBoundary) return false
  if (!isThinPartitionComponent(component, resolution)) return false
  const { cx, cz } = componentCentroidApp(component, width, imgHeight, offsetX, offsetZ, resolution, originX, originY)
  return isPointInAnyShelfAisleZone(cx, cz, shelves, loops, isWalkable)
}

export function computeRelocateTranslation(component, shelf, loops, isWalkable, width, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  const { cx, cz } = componentCentroidApp(component, width, imgHeight, offsetX, offsetZ, resolution, originX, originY)
  const openSign = shelfOpenSignTowardCorridor(shelf.cx, shelf.cz, shelf.yaw, loops, isWalkable)
  const { nx: backNx, nz: backNz } = shelfBackNormal(shelf.yaw, openSign)
  const backDist = shelf.d * 0.5 + WALL_HALF_M
  const targetX = shelf.cx + backNx * backDist
  const targetZ = shelf.cz + backNz * backDist
  return {
    dx: targetX - cx,
    dz: targetZ - cz,
    openSign,
    backNx,
    backNz,
  }
}

export function findNearestShelf(px, pz, shelves) {
  let best = null
  let bestDist = Infinity
  for (const shelf of shelves) {
    const d = Math.hypot(px - shelf.cx, pz - shelf.cz)
    if (d < bestDist) {
      bestDist = d
      best = shelf
    }
  }
  return best
}

export function appWorldToPixel(x, z, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  const wx = x + offsetX
  const wz = z + offsetZ
  return {
    col: (wx - originX) / resolution,
    row: imgHeight - 1 - ((wz - originY) / resolution),
  }
}

export function pixelToAppWorld(col, row, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  const wx = originX + col * resolution
  const wz = originY + (imgHeight - 1 - row) * resolution
  return { x: wx - offsetX, z: wz - offsetZ }
}

function isGridWalkable(grid, width, height, appX, appZ, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  const { col, row } = appWorldToPixel(appX, appZ, imgHeight, offsetX, offsetZ, resolution, originX, originY)
  const c0 = Math.round(col)
  const r0 = Math.round(row)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc
      const r = r0 + dr
      if (c < 0 || c >= width || r < 0 || r >= height) continue
      if (grid[r * width + c] === FREE) return true
    }
  }
  return false
}

export function createGridWalkabilityChecker(grid, width, height, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  return (appX, appZ) => isGridWalkable(grid, width, height, appX, appZ, imgHeight, offsetX, offsetZ, resolution, originX, originY)
}

export function clearShelfFootprintStructureWalls(grid, width, height, shelves, imgHeight, offsetX, offsetZ, resolution, originX, originY) {
  let cleared = 0
  for (const shelf of shelves) {
    if (!shelf.footprint || shelf.footprint.length < 3) continue
    const pixelPoly = shelf.footprint.map(([x, z]) =>
      appWorldToPixel(x, z, imgHeight, offsetX, offsetZ, resolution, originX, originY),
    )
    const minCol = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.col))) - 1)
    const maxCol = Math.min(width - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.col))) + 1)
    const minRow = Math.max(0, Math.floor(Math.min(...pixelPoly.map(p => p.row))) - 1)
    const maxRow = Math.min(height - 1, Math.ceil(Math.max(...pixelPoly.map(p => p.row))) + 1)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!pointInPolygon(col + 0.5, row + 0.5, pixelPoly.map(p => [p.col, p.row]))) continue
        const idx = row * width + col
        if (grid[idx] === WALL) {
          grid[idx] = FREE
          cleared++
        }
      }
    }
  }
  return cleared
}

export function relocateInterAisleWallsBehindShelves({
  grid,
  width,
  height,
  imgHeight,
  offsetX,
  offsetZ,
  resolution,
  originX,
  originY,
  shelves,
  wallLoops,
  wallComponents,
}) {
  const isWalkable = createGridWalkabilityChecker(grid, width, height, imgHeight, offsetX, offsetZ, resolution, originX, originY)

  let footprintCleared = clearShelfFootprintStructureWalls(
    grid, width, height, shelves, imgHeight, offsetX, offsetZ, resolution, originX, originY,
  )

  let relocatedComponents = 0
  let movedPixels = 0
  let corridorCleared = 0

  for (const component of wallComponents) {
    if (!shouldRelocateWallComponent(
      component, shelves, wallLoops, isWalkable, width, imgHeight, offsetX, offsetZ, resolution, originX, originY,
    )) continue

    const { cx, cz } = componentCentroidApp(component, width, imgHeight, offsetX, offsetZ, resolution, originX, originY)
    const shelf = findNearestShelf(cx, cz, shelves)
    if (!shelf) continue

    const { dx, dz } = computeRelocateTranslation(
      component, shelf, wallLoops, isWalkable, width, imgHeight, offsetX, offsetZ, resolution, originX, originY,
    )

    const newIndices = []
    for (const idx of component.indices) {
      grid[idx] = FREE
      corridorCleared++

      const col = idx % width
      const row = (idx - col) / width
      const { x, z } = pixelToAppWorld(col, row, imgHeight, offsetX, offsetZ, resolution, originX, originY)
      const nx = x + dx
      const nz = z + dz
      const { col: nc, row: nr } = appWorldToPixel(nx, nz, imgHeight, offsetX, offsetZ, resolution, originX, originY)
      const nc0 = Math.round(nc)
      const nr0 = Math.round(nr)
      if (nc0 < 0 || nc0 >= width || nr0 < 0 || nr0 >= height) continue
      newIndices.push(nr0 * width + nc0)
    }

    let placed = 0
    for (const ni of newIndices) {
      if (grid[ni] === FREE) {
        grid[ni] = WALL
        placed++
        movedPixels++
      }
    }

    if (placed > 0) relocatedComponents++
  }

  return {
    footprintCleared,
    relocatedComponents,
    movedPixels,
    corridorCleared,
  }
}
