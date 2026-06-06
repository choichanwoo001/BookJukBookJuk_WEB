import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Group } from 'three'
import {
  FIRST_PERSON_DEFAULT_PITCH,
  MAP_VIEW_YAW_OFFSET_RAD,
  THIRD_PERSON_LOCKED_PITCH,
} from '../../config/constants'
import type { ViewMode } from '../../types/scene'

export function useSceneWalkModeSync({
  mode,
  worldRef,
  storedWorldPositionRef,
  yawRef,
  pitchRef,
  prevWalkModeRef,
}: {
  mode: ViewMode
  worldRef: MutableRefObject<Group | null>
  storedWorldPositionRef: MutableRefObject<[number, number]>
  yawRef: MutableRefObject<number>
  pitchRef: MutableRefObject<number>
  prevWalkModeRef: MutableRefObject<'firstPerson' | 'thirdPerson' | null>
}) {
  useEffect(() => {
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
        storedWorldPositionRef.current = [worldRef.current.position.x, worldRef.current.position.z]
        worldRef.current.position.set(0, 0, 0)
        prevWalkModeRef.current = null
        return
      }

      worldRef.current.position.set(
        storedWorldPositionRef.current[0],
        0,
        storedWorldPositionRef.current[1],
      )

      const prev = prevWalkModeRef.current
      if (prev === null) {
        yawRef.current = MAP_VIEW_YAW_OFFSET_RAD
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      } else if (prev !== mode) {
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      }

      prevWalkModeRef.current = isWalk ? mode : null
    }

    apply()
    return () => cancelAnimationFrame(raf)
  }, [mode, pitchRef, prevWalkModeRef, storedWorldPositionRef, worldRef, yawRef])
}
