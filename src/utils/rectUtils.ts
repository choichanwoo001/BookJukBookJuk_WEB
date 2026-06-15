export type RectLike = { cx: number; cz: number; w: number; d: number }

export function pointInRect(r: RectLike, x: number, z: number, padding = 0): boolean {
  const halfW = r.w * 0.5 + padding
  const halfD = r.d * 0.5 + padding
  return x >= r.cx - halfW && x <= r.cx + halfW && z >= r.cz - halfD && z <= r.cz + halfD
}

export function pointInAnyRect(rects: RectLike[], x: number, z: number, padding = 0): boolean {
  return rects.some(r => pointInRect(r, x, z, padding))
}

function bucketKey(ix: number, iz: number) {
  return `${ix},${iz}`
}

export function createRectPointIndex(rects: RectLike[], cellSize = 1) {
  const safeCellSize = Math.max(0.05, cellSize)
  const buckets = new Map<string, RectLike[]>()

  for (const r of rects) {
    const minX = r.cx - r.w * 0.5
    const maxX = r.cx + r.w * 0.5
    const minZ = r.cz - r.d * 0.5
    const maxZ = r.cz + r.d * 0.5
    const ix0 = Math.floor(minX / safeCellSize)
    const ix1 = Math.floor(maxX / safeCellSize)
    const iz0 = Math.floor(minZ / safeCellSize)
    const iz1 = Math.floor(maxZ / safeCellSize)

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const key = bucketKey(ix, iz)
        const bucket = buckets.get(key)
        if (bucket) bucket.push(r)
        else buckets.set(key, [r])
      }
    }
  }

  return (x: number, z: number, padding = 0): boolean => {
    const ix0 = Math.floor((x - padding) / safeCellSize)
    const ix1 = Math.floor((x + padding) / safeCellSize)
    const iz0 = Math.floor((z - padding) / safeCellSize)
    const iz1 = Math.floor((z + padding) / safeCellSize)
    const seen = new Set<RectLike>()

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const bucket = buckets.get(bucketKey(ix, iz))
        if (!bucket) continue
        for (const r of bucket) {
          if (seen.has(r)) continue
          seen.add(r)
          if (pointInRect(r, x, z, padding)) return true
        }
      }
    }

    return false
  }
}
