import { describe, expect, it } from 'vitest'
import { buildDemoScenarioRoute } from './demoScenarioRoute'
import { isSegmentWalkableWorld } from './gridPathfinding'
import { pathLengthM } from './pathSampling'
import { getPathForDisplay, smoothPathForDisplay } from './pathSmoothing'
import type { WalkabilityContext } from './walkability'

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

  it('keeps demo scenario segment length within tolerance', () => {
    const route = buildDemoScenarioRoute()
    for (const seg of route.segments) {
      if (seg.path.length < 2) continue
      const smoothed = smoothPathForDisplay(seg.path)
      const originalLen = pathLengthM(seg.path)
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
    const ctx: WalkabilityContext = {
      floorRects: [{ cx: 2, cz: 1, w: 8, d: 6 }],
      wallRects: [],
      bookshelfRects: [],
      pillarRects: [],
      playerRadiusM: 0,
    }
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ]

    const straight = getPathForDisplay(path, 'straight', { ctx })

    for (let i = 1; i < straight.length; i++) {
      expect(isSegmentWalkableWorld(straight[i - 1], straight[i], ctx, 0.1)).toBe(true)
    }
  })
})
