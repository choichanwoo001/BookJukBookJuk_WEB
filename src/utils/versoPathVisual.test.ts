import { describe, expect, it } from 'vitest'
import { mapImageOffsetX, mapImageOffsetZ } from '../data/mapData'
import { buildFixtureRobotRoute } from '../data/fixtureRobotRoute'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'
import { getMinimapWorldBounds } from './minimapBounds'
import { isSegmentWalkableWorld } from './gridPathfinding'
import { buildNavBookshelfRects } from './missionShelfPool'
import { createNavWalkabilityContext } from './walkability'
import { buildVersoRouteVisual, splitRobotPathByPosition } from './versoPathVisual'

describe('versoPathVisual', () => {
  it('splits path by closest pose to current position', () => {
    const poses = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]
    const split = splitRobotPathByPosition(poses, 1.1, 0)
    expect(split.traveled).toEqual([{ x: 0, y: 0 }])
    expect(split.remaining).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }])
  })

  it('builds navigation route visual from robot path', () => {
    const route = buildVersoRouteVisual(
      { x: 1, y: 2 },
      { poses: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 }] },
    )
    expect(route).not.toBeNull()
    expect(route?.dimPath.length).toBeGreaterThan(0)
    expect(route?.highlightPath.length).toBeGreaterThan(0)
    const [wx, wz] = route!.highlightPath[0]
    expect(wx).toBeCloseTo(1 - mapImageOffsetX)
    expect(wz).toBeCloseTo(2 - mapImageOffsetZ)
  })

  it('returns null when path is empty', () => {
    expect(buildVersoRouteVisual({ x: 0, y: 0 }, { poses: [] })).toBeNull()
    expect(buildVersoRouteVisual({ x: 0, y: 0 }, null)).toBeNull()
  })

  it('densifies sparse robot poses along walkable corridors', () => {
    const bounds = getMinimapWorldBounds()
    const navBounds = {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
    }
    const ctx = createNavWalkabilityContext(
      buildNavBookshelfRects([], bookshelfOverlayLayerInstances),
    )
    const fixtureRoute = buildFixtureRobotRoute()
    const sparse = fixtureRoute.versoPath.poses.filter((_, i) => i % 20 === 0)
    const route = buildVersoRouteVisual(
      null,
      { poses: sparse.length >= 2 ? sparse : fixtureRoute.versoPath.poses.slice(0, 2) },
      { walkabilityCtx: ctx, bounds: navBounds },
    )

    expect(route).not.toBeNull()
    expect(route!.highlightPath.length).toBeGreaterThan(sparse.length)

    for (let i = 1; i < route!.highlightPath.length; i++) {
      expect(
        isSegmentWalkableWorld(
          route!.highlightPath[i - 1],
          route!.highlightPath[i],
          ctx,
          NAV_SEGMENT_SAMPLE_STEP_M,
        ),
      ).toBe(true)
    }
  }, 30_000)
})
