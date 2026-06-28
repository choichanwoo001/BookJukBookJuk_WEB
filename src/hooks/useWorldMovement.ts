import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Group, Vector2 } from 'three'
import { useFrame } from '@react-three/fiber'
import {
  floorRenderRects as baseFloorRects,
  FLOOR_INCLUSION_PADDING_M,
  wallRects,
  allBookshelfCollisionRects,
  pillarRects,
  PLAYER_RADIUS_M,
  SPAWN_POINT_WORLD,
} from '../data/floorPlan'
import {
  TOP_DOWN_KEYBOARD_YAW_RAD_PER_SEC,
  WALK_SPEED_MPS,
  SPAWN_SEARCH_MAX_RADIUS,
  SPAWN_SEARCH_STEP,
} from '../config/constants'
import { createRectPointIndex, pointInAnyRect } from '../utils/rectUtils'
import { overviewYawInput } from '../utils/overviewDisplayFlip'

type KeyState = {
  keyW: boolean
  keyA: boolean
  keyS: boolean
  keyD: boolean
}

const baseFloorContains = createRectPointIndex(baseFloorRects)

function normalizeVector(x: number, y: number) {
  const vector = new Vector2(x, y)
  if (vector.lengthSq() > 1) vector.normalize()
  return vector
}

function canOccupy(point: [number, number]) {
  if (!baseFloorContains(point[0], point[1], FLOOR_INCLUSION_PADDING_M)) return false
  if (pointInAnyRect(wallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(allBookshelfCollisionRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  return true
}

function findSpawnPosition() {
  if (canOccupy(SPAWN_POINT_WORLD)) return [...SPAWN_POINT_WORLD] as [number, number]

  for (let radius = SPAWN_SEARCH_STEP; radius <= SPAWN_SEARCH_MAX_RADIUS; radius += SPAWN_SEARCH_STEP) {
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
  movingRef?: RefObject<boolean>,
  keyboardEnabled = true,
  playerPositionRef?: RefObject<[number, number]>,
) {
  const keyStateRef = useRef<KeyState>({
    keyW: false,
    keyA: false,
    keyS: false,
    keyD: false,
  })
  const internalPlayerPositionRef = useRef<[number, number]>(INITIAL_PLAYER_POS)
  const activePlayerPositionRef = playerPositionRef ?? internalPlayerPositionRef
  const effectiveFloorRects = overrides?.floorRects ?? baseFloorRects
  const effectiveFloorContains = useMemo(
    () => createRectPointIndex(effectiveFloorRects),
    [effectiveFloorRects],
  )

  useEffect(() => {
    const resetKeyState = () => {
      keyStateRef.current = {
        keyW: false,
        keyA: false,
        keyS: false,
        keyD: false,
      }
    }

    resetKeyState()
    if (!keyboardEnabled) return

    const updateKeyState = (code: string, pressed: boolean) => {
      if (code === 'KeyW') keyStateRef.current.keyW = pressed
      if (code === 'KeyA') keyStateRef.current.keyA = pressed
      if (code === 'KeyS') keyStateRef.current.keyS = pressed
      if (code === 'KeyD') keyStateRef.current.keyD = pressed
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardEnabled) return
      updateKeyState(event.code, true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!keyboardEnabled) return
      updateKeyState(event.code, false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      resetKeyState()
    }
  }, [keyboardEnabled])

  useFrame((_, delta) => {
    if (!worldRef.current || !enabled) return

    const effectiveWallRects = overrides?.wallRects ?? wallRects
    const effectiveBookshelfRects = overrides?.bookshelfRects ?? allBookshelfCollisionRects
    const canOccupyWithOverrides = (point: [number, number]) => {
      if (!effectiveFloorContains(point[0], point[1], FLOOR_INCLUSION_PADDING_M)) return false
      if (pointInAnyRect(effectiveWallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(effectiveBookshelfRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      return true
    }

    const key = keyStateRef.current
    if (yawRef) {
      const turn = (key.keyD ? 1 : 0) + (key.keyA ? -1 : 0)
      yawRef.current -= overviewYawInput(turn) * TOP_DOWN_KEYBOARD_YAW_RAD_PER_SEC * delta
    }
    const moveZ = (key.keyS ? 1 : 0) + (key.keyW ? -1 : 0)
    const localDirection = normalizeVector(0, moveZ)
    const yaw = (yawRef?.current ?? 0) + Math.PI
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)
    const direction = new Vector2(
      localDirection.x * cosYaw + localDirection.y * sinYaw,
      -localDirection.x * sinYaw + localDirection.y * cosYaw,
    )
    const current = activePlayerPositionRef.current
    const step = WALK_SPEED_MPS * delta

    const xCandidate: [number, number] = [current[0] + direction.x * step, current[1]]
    if (canOccupyWithOverrides(xCandidate)) current[0] = xCandidate[0]

    const zCandidate: [number, number] = [current[0], current[1] + direction.y * step]
    if (canOccupyWithOverrides(zCandidate)) current[1] = zCandidate[1]

    worldRef.current.position.x = -current[0]
    worldRef.current.position.z = -current[1]

    const isMoving = direction.x !== 0 || direction.y !== 0
    if (movingRef) movingRef.current = isMoving

    if (characterYawRef && yawRef) {
      characterYawRef.current = yawRef.current + Math.PI
    }
  })
}
