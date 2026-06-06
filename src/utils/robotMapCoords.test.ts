import { describe, expect, it } from 'vitest'
import { mapImageOffsetX, mapImageOffsetZ } from '../data/mapData'
import { robotMapToWorldXz, worldXzToRobotMap } from './robotMapCoords'

describe('robotMapCoords', () => {
  it('converts robot map frame to world XZ', () => {
    const [wx, wz] = robotMapToWorldXz(10, 20)
    expect(wx).toBe(10 - mapImageOffsetX)
    expect(wz).toBe(20 - mapImageOffsetZ)
  })

  it('round-trips robot map ↔ world XZ', () => {
    const mapX = 5.5
    const mapY = -3.2
    const [wx, wz] = robotMapToWorldXz(mapX, mapY)
    const back = worldXzToRobotMap(wx, wz)
    expect(back.x).toBeCloseTo(mapX)
    expect(back.y).toBeCloseTo(mapY)
  })
})
