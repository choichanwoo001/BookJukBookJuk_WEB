import type { WallRect } from '../data/mapData'

/**
 * Footprint is w×d in local XZ, rotated by yaw around Y (same as RotatedFixtureInstances).
 * Returns axis-aligned collision rect (center + full w/d) covering the rotated box.
 */
export function axisAlignedBoundsForRotatedBookshelf(
  cx: number,
  cz: number,
  w: number,
  d: number,
  yaw: number,
): WallRect {
  const hw = w * 0.5
  const hd = d * 0.5
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const halfW = Math.abs(c * hw) + Math.abs(s * hd)
  const halfD = Math.abs(s * hw) + Math.abs(c * hd)
  return { cx, cz, w: halfW * 2, d: halfD * 2 }
}
