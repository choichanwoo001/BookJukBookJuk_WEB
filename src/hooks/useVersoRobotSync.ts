import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { Group } from 'three'
import { VERSO_ROBOT_HEADING_OFFSET_RAD } from '../config/constants'
import type { Point2 } from '../data/floorPlan'
import type { VersoStatus } from '../lib/verso/types'
import { robotMapToWorldXz } from '../utils/robotMapCoords'

export function useVersoRobotSync({
  robotSyncActive,
  status,
  worldRef,
  storedWorldPositionRef,
  playerWorldXzRef,
  yawRef,
  characterYawRef,
  isWalkMode,
}: {
  robotSyncActive: boolean
  status: VersoStatus | null
  worldRef: RefObject<Group | null>
  storedWorldPositionRef: RefObject<[number, number]>
  playerWorldXzRef?: RefObject<Point2 | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  isWalkMode: boolean
}): void {
  useEffect(() => {
    if (!robotSyncActive || !status) return

    const [wx, wz] = robotMapToWorldXz(status.x, status.y)
    const heading = status.heading + VERSO_ROBOT_HEADING_OFFSET_RAD

    if (playerWorldXzRef) {
      playerWorldXzRef.current = [wx, wz]
    }

    yawRef.current = heading
    characterYawRef.current = heading

    if (isWalkMode && worldRef.current) {
      worldRef.current.position.set(-wx, 0, -wz)
    } else {
      storedWorldPositionRef.current = [-wx, -wz]
    }
  }, [
    robotSyncActive,
    status,
    worldRef,
    storedWorldPositionRef,
    playerWorldXzRef,
    yawRef,
    characterYawRef,
    isWalkMode,
  ])
}
