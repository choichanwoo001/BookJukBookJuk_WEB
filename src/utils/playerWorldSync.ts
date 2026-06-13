import type { RefObject } from 'react'
import type { Group } from 'three'
import type { Point2 } from '../data/floorPlan'

export function syncPlayerPositionFromWorldRef(
  worldRef: RefObject<Group | null>,
  playerPositionRef: RefObject<Point2 | [number, number]>,
) {
  if (!worldRef.current) return
  playerPositionRef.current[0] = -worldRef.current.position.x
  playerPositionRef.current[1] = -worldRef.current.position.z
}
