export type RectLike = { cx: number; cz: number; w: number; d: number }

export function pointInRect(r: RectLike, x: number, z: number, padding = 0): boolean {
  const halfW = r.w * 0.5 + padding
  const halfD = r.d * 0.5 + padding
  return x >= r.cx - halfW && x <= r.cx + halfW && z >= r.cz - halfD && z <= r.cz + halfD
}

export function pointInAnyRect(rects: RectLike[], x: number, z: number, padding = 0): boolean {
  return rects.some(r => pointInRect(r, x, z, padding))
}
