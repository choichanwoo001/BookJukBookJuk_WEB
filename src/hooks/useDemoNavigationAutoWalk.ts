import { startTransition, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { subscribeMapCommand } from '../agent/runtime/agentEventBus'
import {
  NAV_ARRIVAL_RADIUS_M,
  WALK_SPEED_MPS,
} from '../config/constants'
import { isDemoMode } from '../config/demoMode'
import type { Point2 } from '../data/floorPlan'
import { pathLengthM, projectPointOntoPathDistance, samplePathAtDistance } from '../utils/pathSampling'

export function useDemoNavigationAutoWalk({
  worldRef,
  yawRef,
  characterYawRef,
  playerPositionRef,
  highlightPath,
  currentGoal,
  enabled,
  pauseForIntro,
  pauseForSpeech,
}: {
  worldRef: RefObject<Group | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  playerPositionRef: RefObject<[number, number]>
  highlightPath: Point2[] | null | undefined
  currentGoal: Point2 | null | undefined
  enabled: boolean
  pauseForIntro: boolean
  pauseForSpeech: boolean
}): boolean {
  const [active, setActive] = useState(false)
  const distanceRef = useRef(0)
  const masterPathRef = useRef<Point2[]>([])
  const totalLengthRef = useRef(0)
  const pendingStartRef = useRef(false)

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
    if (enabled) startTransition(() => setActive(true))
  }, [enabled, highlightPath, playerPositionRef])

  useFrame((_, delta) => {
    if (!active || !enabled || pauseForIntro || pauseForSpeech || !worldRef.current) return

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

    distanceRef.current = Math.min(
      totalLengthRef.current,
      distanceRef.current + WALK_SPEED_MPS * delta,
    )
    const sample = samplePathAtDistance(path, distanceRef.current)
    if (!sample) return

    pos[0] = sample.point[0]
    pos[1] = sample.point[1]
    yawRef.current = sample.headingRad
    characterYawRef.current = sample.headingRad + Math.PI

    worldRef.current.position.x = -pos[0]
    worldRef.current.position.z = -pos[1]

    if (distanceRef.current >= totalLengthRef.current - 1e-4) {
      setActive(false)
    }
  })

  return active && enabled
}
