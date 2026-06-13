import { describe, expect, it } from 'vitest'
import {
  clampRobotVelocity,
  createRobotMotionBuffer,
  pushRobotStatus,
  resetRobotMotionBuffer,
  sampleRobotMotion,
} from './robotMotionBuffer'
import type { VersoStatus } from '../lib/verso/types'
import { robotMapToWorldXz } from './robotMapCoords'

function makeStatus(x: number, y: number, isMoving = true): VersoStatus {
  return {
    x,
    y,
    heading: 0,
    mode: isMoving ? 'escort' : 'idle',
    isMoving,
    currentWaypointId: null,
    remainingWaypoints: 0,
  }
}

describe('robotMotionBuffer', () => {
  it('extrapolates position while moving', () => {
    const buffer = createRobotMotionBuffer()
    pushRobotStatus(buffer, makeStatus(0, 0), 0)
    pushRobotStatus(buffer, makeStatus(1, 0), 1000)

    const sample = sampleRobotMotion(buffer, 1500)
    expect(sample).not.toBeNull()
    expect(sample!.worldXz[0]).toBeGreaterThan(robotMapToWorldXz(1, 0)[0])
    expect(sample!.worldXz[1]).toBeCloseTo(robotMapToWorldXz(1, 0)[1], 5)
  })

  it('does not extrapolate when idle', () => {
    const buffer = createRobotMotionBuffer()
    pushRobotStatus(buffer, makeStatus(2, 3, false), 0)

    const sample = sampleRobotMotion(buffer, 500)
    expect(sample!.worldXz).toEqual(robotMapToWorldXz(2, 3))
  })

  it('clamps velocity to display max speed', () => {
    const [vx, vz] = clampRobotVelocity(5, 0)
    expect(Math.hypot(vx, vz)).toBeCloseTo(1.8, 5)
  })

  it('resets buffer state', () => {
    const buffer = createRobotMotionBuffer()
    pushRobotStatus(buffer, makeStatus(1, 1), 0)
    resetRobotMotionBuffer(buffer)
    expect(sampleRobotMotion(buffer, 0)).toBeNull()
  })
})
