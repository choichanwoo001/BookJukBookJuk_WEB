import { useEffect, useLayoutEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Group } from 'three'
import {
  FIRST_PERSON_DEFAULT_PITCH,
  MAP_VIEW_YAW_OFFSET_RAD,
  THIRD_PERSON_LOCKED_PITCH,
} from '../../config/constants'
import { ENTRANCE_SPAWN } from '../../data/floorPlan'
import { subscribeMapCommand } from '../../agent/runtime/agentEventBus'
import type { ViewMode } from '../../types/scene'
import type { Point2 } from '../../data/floorPlan'

export function useSceneWalkModeSync({
  mode,
  worldRef,
  storedWorldPositionRef,
  yawRef,
  pitchRef,
  prevWalkModeRef,
  preserveHeadingOnEnter = false,
  playerWorldXzRef,
  scenarioPlaybackHeadingRef,
  characterYawRef,
  syncFromScenarioPreview = false,
}: {
  mode: ViewMode
  worldRef: MutableRefObject<Group | null>
  storedWorldPositionRef: MutableRefObject<[number, number]>
  yawRef: MutableRefObject<number>
  pitchRef: MutableRefObject<number>
  prevWalkModeRef: MutableRefObject<'firstPerson' | 'thirdPerson' | null>
  preserveHeadingOnEnter?: boolean
  playerWorldXzRef?: MutableRefObject<Point2 | null>
  scenarioPlaybackHeadingRef?: MutableRefObject<number | null>
  characterYawRef?: MutableRefObject<number>
  syncFromScenarioPreview?: boolean
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

      const isWalk = mode === 'firstPerson' || mode === 'thirdPerson'

      if (!isWalk) {
        // 오버뷰 최초 진입 시 world는 (0,0)이라 스폰 좌표를 덮어쓰지 않는다.
        if (prevWalkModeRef.current !== null) {
          storedWorldPositionRef.current = [worldRef.current.position.x, worldRef.current.position.z]
        }
        worldRef.current.position.set(0, 0, 0)
        prevWalkModeRef.current = null
        return
      }

      const prev = prevWalkModeRef.current
      const enteringWalk = prev === null

      // 오버뷰/편집에서 워크 모드로 들어올 때만 저장 좌표 복원.
      // 1인칭↔3인칭 전환 시 월드를 되돌리면 이동 위치가 튀고 카메라가 바닥에서 다시 보간된다.
      if (enteringWalk) {
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
          yawRef.current =
            previewHeading != null && syncFromScenarioPreview
              ? previewHeading
              : MAP_VIEW_YAW_OFFSET_RAD
          if (characterYawRef) {
            characterYawRef.current = yawRef.current + Math.PI
          }
        }
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      } else if (prev !== mode) {
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      }

      prevWalkModeRef.current = isWalk ? mode : null
    }

    apply()
    return () => cancelAnimationFrame(raf)
  }, [
    mode,
    pitchRef,
    playerWorldXzRef,
    preserveHeadingOnEnter,
    prevWalkModeRef,
    scenarioPlaybackHeadingRef,
    storedWorldPositionRef,
    characterYawRef,
    syncFromScenarioPreview,
    worldRef,
    yawRef,
  ])
}
