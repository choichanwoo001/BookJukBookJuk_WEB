import { describe, expect, it } from 'vitest'
import {
  pathHeadingAtPoint,
  pathLengthM,
  projectPointOntoPathDistance,
  samplePathAtDistance,
} from './pathSampling'

describe('pathSampling', () => {
  it('pathLengthM sums segment lengths', () => {
    const path: [number, number][] = [[0, 0], [3, 0], [3, 4]]
    expect(pathLengthM(path)).toBeCloseTo(7, 5)
  })

  it('samplePathAtDistance returns start and end points', () => {
    const path: [number, number][] = [[0, 0], [10, 0]]
    const start = samplePathAtDistance(path, 0)
    const end = samplePathAtDistance(path, 10)
    expect(start?.point).toEqual([0, 0])
    expect(end?.point[0]).toBeCloseTo(10, 5)
    expect(end?.point[1]).toBeCloseTo(0, 5)
  })

  it('samplePathAtDistance advances monotonically along path', () => {
    const path: [number, number][] = [[0, 0], [5, 0], [5, 5]]
    const mid = samplePathAtDistance(path, 5)
    const later = samplePathAtDistance(path, 8)
    expect(mid?.point[0]).toBeCloseTo(5, 5)
    expect(later?.point[1]).toBeGreaterThan(mid!.point[1])
  })

  it('projectPointOntoPathDistance finds closest arc-length on path', () => {
    const path: [number, number][] = [[0, 0], [10, 0], [10, 10]]
    expect(projectPointOntoPathDistance(path, [5, 0])).toBeCloseTo(5, 5)
    expect(projectPointOntoPathDistance(path, [10, 3])).toBeCloseTo(13, 5)
    expect(projectPointOntoPathDistance(path, [0, 0])).toBeCloseTo(0, 5)
  })

  it('projectPointOntoPathDistance preserves progress after intro offset', () => {
    const path: [number, number][] = [[0, 0], [10, 0]]
    const afterIntro = projectPointOntoPathDistance(path, [1.1, 0])
    expect(afterIntro).toBeCloseTo(1.1, 5)
    const sample = samplePathAtDistance(path, afterIntro)
    expect(sample?.point[0]).toBeCloseTo(1.1, 5)
  })

  it('pathHeadingAtPoint returns tangent heading at projected point', () => {
    const path: [number, number][] = [[0, 0], [10, 0], [10, 10]]
    // segment 1: [x,z] = (0,0)→(10,0), moving in +X → yaw = atan2(dx=10, dz=0) = π/2
    expect(pathHeadingAtPoint(path, [5, 0])).toBeCloseTo(Math.PI / 2, 5)
    // segment 2: [x,z] = (10,0)→(10,10), moving in +Z → yaw = atan2(dx=0, dz=10) = 0
    expect(pathHeadingAtPoint(path, [10, 5])).toBeCloseTo(0, 5)
    // path start is on segment 1 (+X direction)
    expect(pathHeadingAtPoint(path, [0, 0])).toBeCloseTo(Math.PI / 2, 5)
  })
})
