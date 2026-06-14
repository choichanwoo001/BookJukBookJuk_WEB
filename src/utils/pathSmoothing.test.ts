import { describe, expect, it } from 'vitest'
import { buildFixtureRobotRoute } from '../data/fixtureRobotRoute'
import { isSegmentWalkableWorld } from './gridPathfinding'
import { pathLengthM } from './pathSampling'
import { getPathForDisplay, smoothPathForDisplay } from './pathSmoothing'
import { createNavWalkabilityContext } from './walkability'
import { buildNavBookshelfRects } from './missionShelfPool'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { NAV_SEGMENT_SAMPLE_STEP_M } from '../config/constants'

describe('smoothPathForDisplay', () => {
  it('returns short paths unchanged', () => {
    const path: [number, number][] = [[0, 0], [1, 1]]
    expect(smoothPathForDisplay(path)).toEqual(path)
  })

  it('preserves start and end points', () => {
    const path: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [5, 2],
    ]
    const smoothed = smoothPathForDisplay(path)
    expect(smoothed[0]).toEqual(path[0])
    expect(smoothed[smoothed.length - 1]).toEqual(path[path.length - 1])
  })

  it('produces more samples for jagged grid-like paths', () => {
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ]
    const smoothed = smoothPathForDisplay(path)
    expect(smoothed.length).toBeGreaterThanOrEqual(path.length)
  })

  it('keeps fixture route world path length within tolerance when smoothed in chunks', () => {
    const route = buildFixtureRobotRoute()
    const chunkSize = 8
    for (let i = 0; i < route.worldPath.length - 1; i += chunkSize) {
      const path = route.worldPath.slice(i, i + chunkSize + 1)
      if (path.length < 2) continue
      const smoothed = smoothPathForDisplay(path)
      const originalLen = pathLengthM(path)
      const smoothedLen = pathLengthM(smoothed)
      expect(smoothedLen).toBeGreaterThan(originalLen * 0.85)
      expect(smoothedLen).toBeLessThan(originalLen * 1.35)
    }
  }, 30_000)

  it('uses existing smoothing for curved display mode', () => {
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ]

    expect(getPathForDisplay(path, 'curved')).toEqual(smoothPathForDisplay(path))
  })

  it('reduces straight display mode to the fewest safe line segments it can find', () => {
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ]

    const straight = getPathForDisplay(path, 'straight')

    expect(straight[0]).toEqual(path[0])
    expect(straight[straight.length - 1]).toEqual(path[path.length - 1])
    expect(straight.length).toBeLessThanOrEqual(path.length)
  })

  it('keeps straight display segments walkable when a context is provided', () => {
    const ctx = createNavWalkabilityContext(
      buildNavBookshelfRects([], bookshelfOverlayLayerInstances),
    )
    const path = buildFixtureRobotRoute().worldPath.slice(0, 12)

    const straight = getPathForDisplay(path, 'straight', { ctx })

    for (let i = 1; i < straight.length; i++) {
      expect(isSegmentWalkableWorld(straight[i - 1], straight[i], ctx, NAV_SEGMENT_SAMPLE_STEP_M)).toBe(true)
    }
  }, 30_000)
})
