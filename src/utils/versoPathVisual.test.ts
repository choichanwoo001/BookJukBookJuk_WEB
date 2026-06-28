import { describe, expect, it } from 'vitest'
import { mapImageOffsetX, mapImageOffsetZ } from '../data/mapData'
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

  it('maps robot poses to world without re-routing', () => {
    const poses = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 }]
    const route = buildVersoRouteVisual(null, { poses })
    expect(route).not.toBeNull()
    expect(route!.highlightPath).toHaveLength(poses.length)
    expect(route!.planPath).toHaveLength(poses.length)
  })
})
