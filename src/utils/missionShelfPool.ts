import type { WallRect } from '../data/mapData'
import type { FixtureRenderInstance } from '../types/scene'
import { axisAlignedBoundsForRotatedBookshelf } from './bookshelfCollision'

/** Same-position threshold (8cm) shared by mission pool and nav rects. */
export const MISSION_SHELF_DEDUPE_M = 0.08

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
  const rects: WallRect[] = mainInstances.map((inst) =>
    axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw),
  )
  for (const o of overlayInstances) {
    const dup = mainInstances.some(
      (m) => Math.hypot(m.cx - o.cx, m.cz - o.cz) < MISSION_SHELF_DEDUPE_M,
    )
    if (!dup) {
      rects.push(axisAlignedBoundsForRotatedBookshelf(o.cx, o.cz, o.w, o.d, o.yaw))
    }
  }
  return rects
}
