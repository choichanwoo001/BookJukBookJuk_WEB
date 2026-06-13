import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import {
  ROBOT_BODY_YAW_SMOOTHING,
  ROBOT_HEADING_SMOOTHING,
  ROBOT_MOVE_DIRECTION_EPSILON_M,
  ROBOT_POSITION_SMOOTHING,
  ROBOT_SYNC_HARD_SNAP_DISTANCE_M,
  ROBOT_SYNC_SNAP_DISTANCE_M,
} from '../config/constants'
import type { Point2 } from '../data/floorPlan'
import type { VersoStatus } from '../lib/verso/types'
import {
  createRobotMotionBuffer,
  pushRobotStatus,
  resetRobotMotionBuffer,
  sampleRobotMotion,
} from '../utils/robotMotionBuffer'

function smoothingAlpha(delta: number, smoothing: number) {
  return 1 - Math.exp(-delta * smoothing)
}

function normalizeAngle(angle: number) {
  let normalized = angle
  while (normalized > Math.PI) normalized -= Math.PI * 2
  while (normalized < -Math.PI) normalized += Math.PI * 2
  return normalized
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + normalizeAngle(target - current) * alpha
}

function robotStatusKey(status: VersoStatus): string {
  return `${status.x},${status.y},${status.heading},${status.isMoving}`
}

export function useVersoRobotSync({
  robotSyncActive,
  status,
  liveStatusRef,
  worldRef,
  storedWorldPositionRef,
  playerWorldXzRef,
  yawRef,
  characterYawRef,
  isWalkMode,
}: {
  robotSyncActive: boolean
  status: VersoStatus | null
  liveStatusRef?: RefObject<VersoStatus | null>
  worldRef: RefObject<Group | null>
  storedWorldPositionRef: RefObject<[number, number]>
  playerWorldXzRef?: RefObject<Point2 | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  isWalkMode: boolean
}): void {
  const motionBufferRef = useRef(createRobotMotionBuffer())
  const snapOnNextFrameRef = useRef(true)
  const previousDisplayedWorldXzRef = useRef<Point2 | null>(null)
  const isMovingRef = useRef(false)
  const lastPushedStatusKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!robotSyncActive) {
      resetRobotMotionBuffer(motionBufferRef.current)
      previousDisplayedWorldXzRef.current = null
      snapOnNextFrameRef.current = true
      lastPushedStatusKeyRef.current = null
    }
  }, [robotSyncActive])

  useEffect(() => {
    snapOnNextFrameRef.current = true
    previousDisplayedWorldXzRef.current = null
  }, [isWalkMode])

  useFrame((_, delta) => {
    if (!robotSyncActive) return

    const nowMs = performance.now()
    const liveStatus = liveStatusRef?.current ?? status
    if (liveStatus) {
      const statusKey = robotStatusKey(liveStatus)
      if (statusKey !== lastPushedStatusKeyRef.current) {
        pushRobotStatus(motionBufferRef.current, liveStatus, nowMs)
        lastPushedStatusKeyRef.current = statusKey
      }
    }

    const motionSample = sampleRobotMotion(motionBufferRef.current, nowMs)
    if (!motionSample) return

    const targetWorldXz = motionSample.worldXz
    const targetHeading = motionSample.heading
    isMovingRef.current = motionSample.isMoving

    if (!isWalkMode || !worldRef.current) {
      storedWorldPositionRef.current = [-targetWorldXz[0], -targetWorldXz[1]]
      if (playerWorldXzRef) {
        playerWorldXzRef.current = [targetWorldXz[0], targetWorldXz[1]]
      }
      yawRef.current = targetHeading
      characterYawRef.current = targetHeading + Math.PI
      snapOnNextFrameRef.current = true
      previousDisplayedWorldXzRef.current = null
      return
    }

    const world = worldRef.current
    const displayedWorldX = -world.position.x
    const displayedWorldZ = -world.position.z
    const dxToTarget = targetWorldXz[0] - displayedWorldX
    const dzToTarget = targetWorldXz[1] - displayedWorldZ
    const distanceToTarget = Math.hypot(dxToTarget, dzToTarget)

    const shouldHardSnap =
      snapOnNextFrameRef.current || distanceToTarget > ROBOT_SYNC_HARD_SNAP_DISTANCE_M
    const shouldSoftSnap =
      !shouldHardSnap && distanceToTarget > ROBOT_SYNC_SNAP_DISTANCE_M

    if (shouldHardSnap) {
      world.position.set(-targetWorldXz[0], 0, -targetWorldXz[1])
      yawRef.current = targetHeading
      characterYawRef.current = targetHeading + Math.PI
      snapOnNextFrameRef.current = false
    } else {
      const positionSmoothing = shouldSoftSnap
        ? ROBOT_POSITION_SMOOTHING * 1.6
        : ROBOT_POSITION_SMOOTHING
      const positionAlpha = smoothingAlpha(delta, positionSmoothing)
      world.position.x += (-targetWorldXz[0] - world.position.x) * positionAlpha
      world.position.z += (-targetWorldXz[1] - world.position.z) * positionAlpha

      const headingAlpha = smoothingAlpha(delta, ROBOT_HEADING_SMOOTHING)
      yawRef.current = lerpAngle(yawRef.current, targetHeading, headingAlpha)

      const nextDisplayedWorldX = -world.position.x
      const nextDisplayedWorldZ = -world.position.z
      const previousDisplayedWorldXz = previousDisplayedWorldXzRef.current
      const movementDx = previousDisplayedWorldXz
        ? nextDisplayedWorldX - previousDisplayedWorldXz[0]
        : dxToTarget
      const movementDz = previousDisplayedWorldXz
        ? nextDisplayedWorldZ - previousDisplayedWorldXz[1]
        : dzToTarget
      const movementDistance = Math.hypot(movementDx, movementDz)
      const headingBodyYaw = targetHeading + Math.PI
      let bodyTargetYaw = headingBodyYaw

      if (isMovingRef.current && movementDistance > ROBOT_MOVE_DIRECTION_EPSILON_M) {
        const movementHeading = Math.atan2(movementDz, movementDx)
        const headingMismatch = Math.abs(normalizeAngle(targetHeading - movementHeading))
        if (headingMismatch > Math.PI / 2) {
          bodyTargetYaw = movementHeading + Math.PI
        }
      }

      const bodyYawAlpha = smoothingAlpha(delta, ROBOT_BODY_YAW_SMOOTHING)
      characterYawRef.current = lerpAngle(characterYawRef.current, bodyTargetYaw, bodyYawAlpha)
    }

    const currentDisplayedWorldXz: Point2 = [-world.position.x, -world.position.z]
    previousDisplayedWorldXzRef.current = currentDisplayedWorldXz
    storedWorldPositionRef.current = [world.position.x, world.position.z]
    if (playerWorldXzRef) {
      playerWorldXzRef.current = currentDisplayedWorldXz
    }
  })
}
