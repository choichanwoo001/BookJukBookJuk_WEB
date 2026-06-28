import { describe, expect, it } from 'vitest'
import { ENTRANCE_SPAWN, pillarRects } from '../data/floorPlan'
import { buildFixtureRobotRoute } from '../data/fixtureRobotRoute'
import { NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'
import { isSegmentWalkableWorld } from './gridPathfinding'
import {
  createNavWalkabilityContext,
  isOnPolygonFloor,
  isWalkablePoint,
} from './walkability'
import { buildNavBookshelfRects } from './missionShelfPool'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'

describe('walkability', () => {
  it('treats entrance spawn as polygon floor', () => {
    expect(isOnPolygonFloor(ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1])).toBe(true)
  })

  it('rejects points far outside the mapped floor', () => {
    expect(isOnPolygonFloor(999, 999)).toBe(false)
    expect(isOnPolygonFloor(-999, -999)).toBe(false)
  })

  it('marks interior route points walkable with nav context', () => {
    const ctx = createNavWalkabilityContext(
      buildNavBookshelfRects([], bookshelfOverlayLayerInstances),
    )
    const route = buildFixtureRobotRoute()
    const walkable = route.worldPath.find(([x, z]) => isWalkablePoint(ctx, x, z))
    expect(walkable).toBeDefined()
  }, 30_000)

  it('includes the manually marked circular pillar areas as obstacles', () => {
    const pillarCenters = [
      [0.582, 3.958],
      [-1.732, -1.769],
      [-3.742, -7.534],
    ] as const

    for (const [x, z] of pillarCenters) {
      expect(
        pillarRects.some((pillar) =>
          Math.abs(pillar.cx - x) < 0.001 &&
          Math.abs(pillar.cz - z) < 0.001 &&
          pillar.w === 0.35 &&
          pillar.d === 0.35,
        ),
      ).toBe(true)
    }
  })
})

describe('fixture robot path walkability', () => {
  it('keeps every routed segment inside walkable floor', () => {
    const route = buildFixtureRobotRoute()
    const ctx = createNavWalkabilityContext(
      buildNavBookshelfRects([], bookshelfOverlayLayerInstances),
    )

    expect(route.worldPath.length).toBeGreaterThan(2)

    for (let i = 1; i < route.worldPath.length; i++) {
      expect(
        isSegmentWalkableWorld(
          route.worldPath[i - 1],
          route.worldPath[i],
          ctx,
          NAV_SEGMENT_SAMPLE_STEP_M,
        ),
      ).toBe(true)
    }
  }, 30_000)
})
