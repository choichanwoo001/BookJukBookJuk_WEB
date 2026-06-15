import { useEffect, useLayoutEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Group } from 'three'
import { MAP_VIEW_YAW_OFFSET_RAD } from '../../config/constants'
import { ENTRANCE_SPAWN } from '../../data/floorPlan'
import { subscribeMapCommand } from '../../agent/runtime/agentEventBus'
import type { ViewMode } from '../../types/scene'
import type { Point2 } from '../../data/floorPlan'

export function useSceneTopDownSync({
  mode,
  worldRef,
  storedWorldPositionRef,
  yawRef,
  prevTopDownModeRef,
  preserveHeadingOnEnter = false,
  playerWorldXzRef,
  scenarioPlaybackHeadingRef,
  characterYawRef,
  syncFromScenarioPreview = false,
  navigationHeadingRef,
}: {
  mode: ViewMode
  worldRef: MutableRefObject<Group | null>
  storedWorldPositionRef: MutableRefObject<[number, number]>
  yawRef: MutableRefObject<number>
  prevTopDownModeRef: MutableRefObject<'topDown' | null>
  preserveHeadingOnEnter?: boolean
  playerWorldXzRef?: MutableRefObject<Point2 | null>
  scenarioPlaybackHeadingRef?: MutableRefObject<number | null>
  characterYawRef?: MutableRefObject<number>
  syncFromScenarioPreview?: boolean
  navigationHeadingRef?: MutableRefObject<number | null>
}) {
  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      const wx = -ENTRANCE_SPAWN[0]
      const wz = -ENTRANCE_SPAWN[1]
      storedWorldPositionRef.current = [wx, wz]
      if (playerWorldXzRef) {
        playerWorldXzRef.current = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
      }
    })
  }, [playerWorldXzRef, storedWorldPositionRef])

  useLayoutEffect(() => {
    let raf = 0
    let attempts = 0
    const maxAttempts = 12

    const apply = () => {
      if (!worldRef.current) {
        attempts += 1
        if (attempts < maxAttempts) raf = requestAnimationFrame(apply)
        return
      }

      const isTopDown = mode === 'topDown'

      if (!isTopDown) {
        if (prevTopDownModeRef.current !== null) {
          storedWorldPositionRef.current = [worldRef.current.position.x, worldRef.current.position.z]
        }
        worldRef.current.position.set(0, 0, 0)
        prevTopDownModeRef.current = null
        return
      }

      const enteringTopDown = prevTopDownModeRef.current === null

      if (enteringTopDown) {
        if (syncFromScenarioPreview && playerWorldXzRef?.current) {
          const [x, z] = playerWorldXzRef.current
          storedWorldPositionRef.current = [-x, -z]
        }
        worldRef.current.position.set(
          storedWorldPositionRef.current[0],
          0,
          storedWorldPositionRef.current[1],
        )
        if (!preserveHeadingOnEnter) {
          const previewHeading = scenarioPlaybackHeadingRef?.current
          const navHeading = navigationHeadingRef?.current
          yawRef.current =
            previewHeading != null && syncFromScenarioPreview
              ? previewHeading
              : navHeading ?? MAP_VIEW_YAW_OFFSET_RAD
          if (characterYawRef) {
            characterYawRef.current = yawRef.current + Math.PI
          }
        }
      }

      prevTopDownModeRef.current = isTopDown ? 'topDown' : null
    }

    apply()
    return () => cancelAnimationFrame(raf)
  }, [
    mode,
    playerWorldXzRef,
    preserveHeadingOnEnter,
    prevTopDownModeRef,
    scenarioPlaybackHeadingRef,
    storedWorldPositionRef,
    characterYawRef,
    syncFromScenarioPreview,
    navigationHeadingRef,
    worldRef,
    yawRef,
  ])
}
