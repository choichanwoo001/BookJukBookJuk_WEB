import { bookColorHex, hashSeed, mulberry32 } from './bookGeometryUtils'
import { nearestWallInfo, snapBookshelfCenterFlushToWall } from './wallAlignment'

export const BOOKSHELF_PANEL_T = 0.024
export const BOOKSHELF_PARTITION_T = 0.018
export const BOOKSHELF_SHELF_T = 0.016
export const MIN_BOOKSHELF_DETAIL_W = 0.28
export const MIN_BOOKSHELF_DETAIL_D = 0.18

const OPEN_AT_POS_Z = true

export type BookSpec = {
  key: string
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: string
}

export type IslandLayout = {
  mode: 'island'
  shelfYs: number[]
  books: BookSpec[]
  partitionsX: { x: number; key: string }[]
  partitionsZ: { z: number; key: string }[]
  depthZ: number
  zShelfCenter: number
  innerW: number
  innerD: number
}

export type WallLayout = {
  mode: 'wall'
  shelfYs: number[]
  books: BookSpec[]
  partitions: { x: number; key: string }[]
  depthZ: number
  zShelfCenter: number
}

export function isWallAttachedShelf(cx: number, cz: number, d: number): boolean {
  const hit = nearestWallInfo(cx, cz)
  if (!hit) return false
  return hit.distM < d * 0.52 + 0.28
}

/** +1 when local +Z already opens toward walkable floor; -1 when a Z mirror is needed. */
export function shelfOpenSignTowardCorridor(cx: number, cz: number, yaw: number): 1 | -1 {
  const { yaw: corridorYaw } = snapBookshelfCenterFlushToWall(cx, cz, yaw, 0.5)
  const dot =
    Math.sin(yaw) * Math.sin(corridorYaw) +
    Math.cos(yaw) * Math.cos(corridorYaw)
  return dot < 0 ? -1 : 1
}

export function computeIslandLayout(
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  hInner: number,
): IslandLayout {
  const margin = BOOKSHELF_PANEL_T
  const innerW = Math.max(0.06, w - 2 * margin)
  const innerD = Math.max(0.06, d - 2 * margin)
  const nBaysX = Math.max(1, Math.min(8, Math.floor(w / 0.35)))
  const nBaysZ = Math.max(1, Math.min(6, Math.floor(d / 0.35)))
  const mShelves = Math.max(2, Math.min(7, Math.floor(h / 0.38)))
  const bayW = innerW / nBaysX
  const bayD = innerD / nBaysZ
  const depthZ = innerD
  const zShelfCenter = 0

  const shelfYs: number[] = []
  for (let j = 1; j <= mShelves; j += 1) {
    const t = j / (mShelves + 1)
    shelfYs.push(-h * 0.5 + BOOKSHELF_PANEL_T + t * hInner)
  }

  const books: BookSpec[] = []
  for (let iz = 0; iz < nBaysZ; iz += 1) {
    const z0 = -d * 0.5 + margin + iz * bayD
    const z1 = z0 + bayD
    const zCellMid = (z0 + z1) * 0.5
    const zSpan = z1 - z0
    for (let ix = 0; ix < nBaysX; ix += 1) {
      const x0 = -w * 0.5 + margin + ix * bayW
      const x1 = x0 + bayW
      for (const yShelf of shelfYs) {
        let xCursor = x0 + 0.015
        let bookIdx = 0
        const shelfSurfaceY = yShelf + BOOKSHELF_SHELF_T * 0.5 + 0.008
        const rndRow = mulberry32(hashSeed(cx, cz, ix, iz, Math.round(yShelf * 1000)))
        while (xCursor < x1 - 0.03) {
          const seed = hashSeed(cx, cz, ix, iz, Math.round(yShelf * 1000), bookIdx)
          const rnd = mulberry32(seed)
          const thick = 0.016 + rnd() * 0.026
          const bH = 0.11 + rnd() * 0.13
          const bD = Math.min(zSpan - 0.04, zSpan * (0.55 + rnd() * 0.32))
          if (xCursor + thick > x1 - 0.02) break
          books.push({
            key: `i-${ix}-${iz}-${yShelf.toFixed(3)}-${bookIdx}`,
            x: xCursor + thick * 0.5,
            y: shelfSurfaceY + bH * 0.5,
            z: zCellMid,
            sx: thick,
            sy: bH,
            sz: bD,
            color: bookColorHex(seed),
          })
          xCursor += thick + 0.004 + rndRow() * 0.01
          bookIdx += 1
        }
      }
    }
  }

  const partitionsX: { x: number; key: string }[] = []
  for (let k = 1; k < nBaysX; k += 1) {
    partitionsX.push({ x: -w * 0.5 + margin + k * bayW, key: `px-${k}` })
  }
  const partitionsZ: { z: number; key: string }[] = []
  for (let k = 1; k < nBaysZ; k += 1) {
    partitionsZ.push({ z: -d * 0.5 + margin + k * bayD, key: `pz-${k}` })
  }

  return { mode: 'island', shelfYs, books, partitionsX, partitionsZ, depthZ, zShelfCenter, innerW, innerD }
}

export function computeWallLayout(
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  wInner: number,
  hInner: number,
): WallLayout {
  const nBays = Math.max(1, Math.min(8, Math.floor(w / 0.35)))
  const mShelves = Math.max(2, Math.min(7, Math.floor(h / 0.38)))
  const bayW = wInner / nBays
  const zBackInner = -d * 0.5 + BOOKSHELF_PANEL_T
  const zFrontInner = OPEN_AT_POS_Z ? d * 0.5 - 0.03 : -d * 0.5 + BOOKSHELF_PANEL_T
  const depthZ = Math.max(0.08, zFrontInner - zBackInner)
  const zShelfCenter = (zBackInner + zFrontInner) * 0.5
  const zBookBack = zBackInner + depthZ * 0.06
  const zBookFront = zFrontInner - depthZ * 0.1

  const shelfYs: number[] = []
  for (let j = 1; j <= mShelves; j += 1) {
    const t = j / (mShelves + 1)
    shelfYs.push(-h * 0.5 + BOOKSHELF_PANEL_T + t * hInner)
  }

  const books: BookSpec[] = []
  for (let bay = 0; bay < nBays; bay += 1) {
    const x0 = -w * 0.5 + BOOKSHELF_PANEL_T + bay * bayW
    const x1 = x0 + bayW
    for (const yShelf of shelfYs) {
      let xCursor = x0 + 0.02
      let bookIdx = 0
      const shelfSurfaceY = yShelf + BOOKSHELF_SHELF_T * 0.5 + 0.008
      const rndRow = mulberry32(hashSeed(cx, cz, bay, Math.round(yShelf * 1000)))
      while (xCursor < x1 - 0.04) {
        const seed = hashSeed(cx, cz, bay, Math.round(yShelf * 1000), bookIdx)
        const rnd = mulberry32(seed)
        const thick = 0.018 + rnd() * 0.028
        const bH = 0.12 + rnd() * 0.14
        const bD = Math.min(zBookFront - zBookBack - 0.02, depthZ * (0.55 + rnd() * 0.28))
        if (xCursor + thick > x1 - 0.02) break
        const zc = (zBookBack + zBookFront) * 0.5
        books.push({
          key: `${bay}-${yShelf.toFixed(3)}-${bookIdx}`,
          x: xCursor + thick * 0.5,
          y: shelfSurfaceY + bH * 0.5,
          z: zc,
          sx: thick,
          sy: bH,
          sz: bD,
          color: bookColorHex(seed),
        })
        xCursor += thick + 0.004 + rndRow() * 0.012
        bookIdx += 1
      }
    }
  }

  const partitions: { x: number; key: string }[] = []
  for (let k = 1; k < nBays; k += 1) {
    partitions.push({ x: -w * 0.5 + BOOKSHELF_PANEL_T + k * bayW, key: `p-${k}` })
  }

  return { mode: 'wall', shelfYs, books, partitions, depthZ, zShelfCenter }
}
