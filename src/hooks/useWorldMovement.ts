import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Group, Vector2 } from 'three'
import { useFrame } from '@react-three/fiber'
import {
  floorRects as baseFloorRects,
  wallRects,
  bookshelfRects,
  pillarRects,
  PLAYER_RADIUS_M,
  SPAWN_POINT_WORLD,
} from '../data/floorPlan'
import { pointInAnyRect } from '../utils/rectUtils'

type KeyState = {
  keyW: boolean
  keyA: boolean
  keyS: boolean
  keyD: boolean
}

const WALK_SPEED_MPS = 2.8

function normalizeVector(x: number, y: number) {
  const vector = new Vector2(x, y)
  if (vector.lengthSq() > 1) vector.normalize()
  return vector
}

function canOccupy(point: [number, number]) {
  if (!pointInAnyRect(baseFloorRects, point[0], point[1])) return false
  if (pointInAnyRect(wallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(bookshelfRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  return true
}

function findSpawnPosition() {
  if (canOccupy(SPAWN_POINT_WORLD)) return [...SPAWN_POINT_WORLD] as [number, number]

  const maxRadius = 5
  const step = 0.3
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const candidate: [number, number] = [
        SPAWN_POINT_WORLD[0] + Math.cos(angle) * radius,
        SPAWN_POINT_WORLD[1] + Math.sin(angle) * radius,
      ]
      if (canOccupy(candidate)) return candidate
    }
  }

  return [0, 0] as [number, number]
}

export const INITIAL_PLAYER_POS = findSpawnPosition()

type DynamicCollisionOverrides = {
  floorRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  wallRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  bookshelfRects?: Array<{ cx: number; cz: number; w: number; d: number }>
}

export function useWorldMovement(
  worldRef: RefObject<Group | null>,
  yawRef?: RefObject<number>,
  enabled = true,
  overrides?: DynamicCollisionOverrides,
  characterYawRef?: RefObject<number>,
) {
  const keyStateRef = useRef<KeyState>({
    keyW: false,
    keyA: false,
    keyS: false,
    keyD: false,
  })
  const playerPositionRef = useRef<[number, number]>(INITIAL_PLAYER_POS)

  useEffect(() => {
    const updateKeyState = (code: string, pressed: boolean) => {
      if (code === 'KeyW') keyStateRef.current.keyW = pressed
      if (code === 'KeyA') keyStateRef.current.keyA = pressed
      if (code === 'KeyS') keyStateRef.current.keyS = pressed
      if (code === 'KeyD') keyStateRef.current.keyD = pressed
    }

    const handleKeyDown = (event: KeyboardEvent) => updateKeyState(event.code, true)
    const handleKeyUp = (event: KeyboardEvent) => updateKeyState(event.code, false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useFrame((_, delta) => {
    if (!worldRef.current || !enabled) return

    const effectiveFloorRects = overrides?.floorRects ?? baseFloorRects
    const effectiveWallRects = overrides?.wallRects ?? wallRects
    const effectiveBookshelfRects = overrides?.bookshelfRects ?? bookshelfRects
    const canOccupyWithOverrides = (point: [number, number]) => {
      if (!pointInAnyRect(effectiveFloorRects, point[0], point[1])) return false
      if (pointInAnyRect(effectiveWallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(effectiveBookshelfRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      return true
    }

    const key = keyStateRef.current
    const moveX = (key.keyD ? 1 : 0) + (key.keyA ? -1 : 0)
    const moveZ = (key.keyS ? 1 : 0) + (key.keyW ? -1 : 0)
    const localDirection = normalizeVector(moveX, moveZ)
    const yaw = yawRef?.current ?? 0
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)
    const direction = new Vector2(
      localDirection.x * cosYaw + localDirection.y * sinYaw,
      -localDirection.x * sinYaw + localDirection.y * cosYaw,
    )
    const current = playerPositionRef.current
    const step = WALK_SPEED_MPS * delta

    const xCandidate: [number, number] = [current[0] + direction.x * step, current[1]]
    if (canOccupyWithOverrides(xCandidate)) current[0] = xCandidate[0]

    const zCandidate: [number, number] = [current[0], current[1] + direction.y * step]
    if (canOccupyWithOverrides(zCandidate)) current[1] = zCandidate[1]

    worldRef.current.position.x = -current[0]
    worldRef.current.position.z = -current[1]

    if (characterYawRef && (direction.x !== 0 || direction.y !== 0)) {
      characterYawRef.current = Math.atan2(-direction.x, -direction.y)
    }
  })
}
