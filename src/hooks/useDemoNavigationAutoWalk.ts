import { startTransition, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { subscribeMapCommand, subscribeNavigationSync } from '../agent/runtime/agentEventBus'
import {
  NAV_ARRIVAL_RADIUS_M,
  NAV_HEADING_LOOK_AHEAD_M,
  NAV_HEADING_SMOOTH_LAMBDA,
  WALK_SPEED_MPS,
} from '../config/constants'
import { isDemoMode } from '../config/demoMode'
import type { Point2 } from '../data/floorPlan'
import { pathLengthM, projectPointOntoPathDistance, samplePathAtDistance } from '../utils/pathSampling'

function normalizeAngle(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + normalizeAngle(target - current) * alpha
}

export function useDemoNavigationAutoWalk({
  worldRef,
  yawRef,
  characterYawRef,
  playerPositionRef,
  highlightPath,
  currentGoal,
  enabled,
}: {
  worldRef: RefObject<Group | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  playerPositionRef: RefObject<[number, number]>
  highlightPath: Point2[] | null | undefined
  currentGoal: Point2 | null | undefined
  enabled: boolean
}): boolean {
  const [active, setActive] = useState(false)
  const distanceRef = useRef(0)
  const masterPathRef = useRef<Point2[]>([])
  const totalLengthRef = useRef(0)
  const pendingStartRef = useRef(false)
  const mobilityHoldRef = useRef(false)
  const smoothedHeadingRef = useRef<number | null>(null)

  useEffect(() => {
    return subscribeNavigationSync((sync) => {
      mobilityHoldRef.current = sync.mobilityHold
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      setActive(false)
      return
    }
    if (pendingStartRef.current) {
      pendingStartRef.current = false
      setActive(true)
    }
  }, [enabled])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'START_NAVIGATION' && isDemoMode()) {
        distanceRef.current = 0
        smoothedHeadingRef.current = null
        pendingStartRef.current = true
        if (enabled) {
          pendingStartRef.current = false
          setActive(true)
        }
      }
      if (command.type === 'PAUSE_MOBILITY') {
        pendingStartRef.current = false
        setActive(false)
      }
    })
  }, [enabled])

  useEffect(() => {
    if (!highlightPath || highlightPath.length < 2) return
    masterPathRef.current = highlightPath
    totalLengthRef.current = pathLengthM(highlightPath)
    const pos = playerPositionRef.current
    distanceRef.current = projectPointOntoPathDistance(highlightPath, [pos[0], pos[1]])
    smoothedHeadingRef.current = null
    if (enabled) startTransition(() => setActive(true))
  }, [enabled, highlightPath, playerPositionRef])

  useFrame((_, delta) => {
    if (!active || !enabled || mobilityHoldRef.current || !worldRef.current) return

    const path = masterPathRef.current
    if (path.length < 2) return

    const pos = playerPositionRef.current
    if (currentGoal && distanceRef.current > 0.05) {
      const distToGoal = Math.hypot(pos[0] - currentGoal[0], pos[1] - currentGoal[1])
      if (distToGoal < NAV_ARRIVAL_RADIUS_M) {
        setActive(false)
        return
      }
    }

    const safeDelta = Math.min(delta, 1 / 30)
    distanceRef.current = Math.min(
      totalLengthRef.current,
      distanceRef.current + WALK_SPEED_MPS * safeDelta,
    )
    const sample = samplePathAtDistance(path, distanceRef.current)
    if (!sample) return

    pos[0] = sample.point[0]
    pos[1] = sample.point[1]

    const lookAheadDist = Math.min(totalLengthRef.current, distanceRef.current + NAV_HEADING_LOOK_AHEAD_M)
    const headingSample = samplePathAtDistance(path, lookAheadDist)
    const targetHeading = headingSample?.headingRad ?? sample.headingRad

    if (smoothedHeadingRef.current === null) {
      smoothedHeadingRef.current = targetHeading
    } else {
      const alpha = 1 - Math.exp(-safeDelta * NAV_HEADING_SMOOTH_LAMBDA)
      smoothedHeadingRef.current = lerpAngle(smoothedHeadingRef.current, targetHeading, alpha)
    }

    yawRef.current = smoothedHeadingRef.current
    characterYawRef.current = smoothedHeadingRef.current + Math.PI

    const posAlpha = 1 - Math.exp(-safeDelta * 30)
    worldRef.current.position.x += (-pos[0] - worldRef.current.position.x) * posAlpha
    worldRef.current.position.z += (-pos[1] - worldRef.current.position.z) * posAlpha

    if (distanceRef.current >= totalLengthRef.current - 1e-4) {
      setActive(false)
    }
  })

  return active && enabled
}
