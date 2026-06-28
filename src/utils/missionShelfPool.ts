import type { WallRect } from '../data/mapData'
import type { FixtureRenderInstance } from '../types/scene'
import { axisAlignedBoundsForRotatedBookshelf } from './bookshelfCollision'

/** Same-position threshold (8cm) shared by mission pool and nav rects. */
export const MISSION_SHELF_DEDUPE_M = 0.08

function axisAlignedBoundsForFixture(inst: FixtureRenderInstance): WallRect {
  if (inst.footprint && inst.footprint.length >= 3) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of inst.footprint) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
    }
  }
  return axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw)
}

/**
 * Bookshelf pool used for mission picking.
 *
 * Behavior preserved from the original `mergeMissionBookshelfPool` in
 * `Map3DView.tsx`:
 * - main is filtered to bookshelf-only;
 * - overlay candidates are accepted only if no accepted bookshelf (main or
 *   previously-pushed overlay) sits within {@link MISSION_SHELF_DEDUPE_M}.
 */
export function buildMissionShelfPool(
  mainInstances: FixtureRenderInstance[],
  overlayInstances: FixtureRenderInstance[],
): FixtureRenderInstance[] {
  const pool: FixtureRenderInstance[] = mainInstances.filter((m) => m.kind === 'bookshelf')
  for (const o of overlayInstances) {
    if (o.kind !== 'bookshelf') continue
    const dup = pool.some((m) => Math.hypot(m.cx - o.cx, m.cz - o.cz) < MISSION_SHELF_DEDUPE_M)
    if (!dup) pool.push(o)
  }
  return pool
}

/**
 * Axis-aligned collision rects used by the navigation planner.
 *
 * Behavior preserved from the original `navBookshelfRects` in `Map3DView.tsx`:
 * - rects are produced from the *full* main instances regardless of `kind`;
 * - overlay candidates are dedup'd against *full* main only (no kind filter,
 *   no overlay-vs-overlay dedupe).
 *
 * Kept distinct from {@link buildMissionShelfPool} on purpose — see the visual
 * consistency guard in the refactor plan.
 */
export function buildNavBookshelfRects(
  mainInstances: FixtureRenderInstance[],
  overlayInstances: FixtureRenderInstance[],
): WallRect[] {
  const rects: WallRect[] = mainInstances.map(axisAlignedBoundsForFixture)
  for (const o of overlayInstances) {
    const dup = mainInstances.some(
      (m) => Math.hypot(m.cx - o.cx, m.cz - o.cz) < MISSION_SHELF_DEDUPE_M,
    )
    if (!dup) {
      rects.push(axisAlignedBoundsForFixture(o))
    }
  }
  return rects
}
