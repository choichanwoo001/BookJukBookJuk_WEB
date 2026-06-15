import { describe, expect, it } from 'vitest'
import { findWallSegmentsBetweenPoints } from './wallSelectBetweenPoints'

const TEST_LOOPS: [number, number][][] = [
  [
    [0, 0],
    [0, 10],
    [0.2, 10],
    [0.2, 0],
  ],
  [
    [5, 2],
    [5, 8],
  ],
]

describe('findWallSegmentsBetweenPoints', () => {
  it('finds a wall segment parallel to the click span', () => {
    const hits = findWallSegmentsBetweenPoints(5, 1, 5, 9, TEST_LOOPS, 0.6)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].ax).toBe(5)
    expect(hits[0].az).toBe(2)
    expect(hits[0].bx).toBe(5)
    expect(hits[0].bz).toBe(8)
  })

  it('returns empty when span is too short', () => {
    expect(findWallSegmentsBetweenPoints(1, 1, 1.01, 1.01, TEST_LOOPS)).toEqual([])
  })

  it('returns empty when no parallel wall is near the span', () => {
    const hits = findWallSegmentsBetweenPoints(2, 1, 2, 9, TEST_LOOPS, 0.2)
    expect(hits).toEqual([])
  })
})
