import { ROBOT_DISPLAY_MAX_SPEED_MPS, VERSO_ROBOT_HEADING_OFFSET_RAD } from '../config/constants'
import type { Point2 } from '../data/floorPlan'
import type { VersoStatus } from '../lib/verso/types'
import { robotMapToWorldXz } from './robotMapCoords'

const VELOCITY_EMA_LAMBDA = 8
const MIN_VELOCITY_SAMPLE_DT_S = 0.001
const MAX_EXTRAPOLATION_S = 0.35

export type RobotMotionSample = {
  worldXz: Point2
  heading: number
  isMoving: boolean
}

export type RobotMotionBufferState = {
  hasSample: boolean
  sampleAtMs: number
  worldXz: Point2
  heading: number
  isMoving: boolean
  velocityXz: Point2
  lastRawWorldXz: Point2 | null
  lastRawAtMs: number
}

export function createRobotMotionBuffer(): RobotMotionBufferState {
  return {
    hasSample: false,
    sampleAtMs: 0,
    worldXz: [0, 0],
    heading: 0,
    isMoving: false,
    velocityXz: [0, 0],
    lastRawWorldXz: null,
    lastRawAtMs: 0,
  }
}

export function clampRobotVelocity(vx: number, vz: number): Point2 {
  const speed = Math.hypot(vx, vz)
  if (speed <= ROBOT_DISPLAY_MAX_SPEED_MPS || speed < 1e-6) return [vx, vz]
  const scale = ROBOT_DISPLAY_MAX_SPEED_MPS / speed
  return [vx * scale, vz * scale]
}

export function pushRobotStatus(
  buffer: RobotMotionBufferState,
  status: VersoStatus,
  nowMs: number,
): void {
  const [wx, wz] = robotMapToWorldXz(status.x, status.y)
  const heading = status.heading + VERSO_ROBOT_HEADING_OFFSET_RAD

  if (buffer.lastRawWorldXz) {
    const dtS = (nowMs - buffer.lastRawAtMs) / 1000
    if (dtS >= MIN_VELOCITY_SAMPLE_DT_S) {
      const rawVx = (wx - buffer.lastRawWorldXz[0]) / dtS
      const rawVz = (wz - buffer.lastRawWorldXz[1]) / dtS
      const [clampedVx, clampedVz] = clampRobotVelocity(rawVx, rawVz)
      const alpha = 1 - Math.exp(-dtS * VELOCITY_EMA_LAMBDA)
      buffer.velocityXz = [
        buffer.velocityXz[0] + (clampedVx - buffer.velocityXz[0]) * alpha,
        buffer.velocityXz[1] + (clampedVz - buffer.velocityXz[1]) * alpha,
      ]
    }
  } else {
    buffer.velocityXz = [0, 0]
  }

  buffer.lastRawWorldXz = [wx, wz]
  buffer.lastRawAtMs = nowMs
  buffer.worldXz = [wx, wz]
  buffer.heading = heading
  buffer.isMoving = status.isMoving
  buffer.sampleAtMs = nowMs
  buffer.hasSample = true

  if (!status.isMoving) {
    buffer.velocityXz = [0, 0]
  }
}

export function sampleRobotMotion(
  buffer: RobotMotionBufferState,
  nowMs: number,
): RobotMotionSample | null {
  if (!buffer.hasSample) return null

  let x = buffer.worldXz[0]
  let z = buffer.worldXz[1]
  if (buffer.isMoving) {
    const elapsedS = Math.min(MAX_EXTRAPOLATION_S, (nowMs - buffer.sampleAtMs) / 1000)
    const [vx, vz] = clampRobotVelocity(buffer.velocityXz[0], buffer.velocityXz[1])
    x += vx * elapsedS
    z += vz * elapsedS
  }

  return {
    worldXz: [x, z],
    heading: buffer.heading,
    isMoving: buffer.isMoving,
  }
}

export function resetRobotMotionBuffer(buffer: RobotMotionBufferState): void {
  Object.assign(buffer, createRobotMotionBuffer())
}
