import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector2 } from 'three'
import type { RefObject } from 'react'
import type { Group } from 'three'
import { subscribeMapCommand } from '../agent/runtime/agentEventBus'
import {
  floorRects as baseFloorRects,
  wallRects,
  pillarRects,
  PLAYER_RADIUS_M,
  type Point2,
} from '../data/floorPlan'
import { WALK_SPEED_MPS } from '../config/constants'
import { pointInAnyRect } from '../utils/rectUtils'

type IntroPhase = 'lookLeft' | 'lookRight' | 'lookCenter' | 'walkForward' | 'done'

const LOOK_LEFT_ANGLE_RAD = -0.42
const LOOK_RIGHT_ANGLE_RAD = 0.42
const LOOK_LEFT_DURATION_S = 0.65
const LOOK_RIGHT_DURATION_S = 0.95
const LOOK_CENTER_DURATION_S = 0.45
const WALK_DISTANCE_M = 1.1

type DynamicCollisionOverrides = {
  floorRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  wallRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  bookshelfRects?: Array<{ cx: number; cz: number; w: number; d: number }>
}

function canOccupy(
  point: [number, number],
  overrides?: DynamicCollisionOverrides,
) {
  const floorRects = overrides?.floorRects ?? baseFloorRects
  const effectiveWallRects = overrides?.wallRects ?? wallRects
  const bookshelfRects = overrides?.bookshelfRects ?? []
  if (!pointInAnyRect(floorRects, point[0], point[1])) return false
  if (pointInAnyRect(effectiveWallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(bookshelfRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  return true
}

function syncPlayerPosFromWorld(
  worldRef: RefObject<Group | null>,
  playerPositionRef: RefObject<[number, number]>,
) {
  if (!worldRef.current) return
  playerPositionRef.current[0] = -worldRef.current.position.x
  playerPositionRef.current[1] = -worldRef.current.position.z
}

function moveForward(
  playerPositionRef: RefObject<[number, number]>,
  yawRef: RefObject<number>,
  step: number,
  overrides?: DynamicCollisionOverrides,
) {
  const yaw = yawRef.current + Math.PI
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const direction = new Vector2(-sinYaw, cosYaw)
  const current = playerPositionRef.current
  const xCandidate: [number, number] = [current[0] + direction.x * step, current[1]]
  if (canOccupy(xCandidate, overrides)) current[0] = xCandidate[0]
  const zCandidate: [number, number] = [current[0], current[1] + direction.y * step]
  if (canOccupy(zCandidate, overrides)) current[1] = zCandidate[1]
}

/**
 * 안내 시작(START_NAVIGATION) 직후 짧은 둘러보기: 좌우 시선 → 앞으로 조금 걷기.
 */
export function useGuidanceIntroMotion({
  worldRef,
  yawRef,
  characterYawRef,
  playerPositionRef,
  enabled,
  collisionOverrides,
}: {
  worldRef: RefObject<Group | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  playerPositionRef: RefObject<[number, number]>
  enabled: boolean
  collisionOverrides?: DynamicCollisionOverrides
}) {
  const [active, setActive] = useState(false)
  const phaseRef = useRef<IntroPhase>('lookLeft')
  const phaseTimerRef = useRef(0)
  const walkRemainingRef = useRef(WALK_DISTANCE_M)
  const baseYawRef = useRef(0)
  // START_NAVIGATION 수신 시 overview 상태라 world=(0,0)이므로, 첫 useFrame 프레임에서 동기화
  const needsInitRef = useRef(false)

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      phaseRef.current = 'lookLeft'
      phaseTimerRef.current = 0
      walkRemainingRef.current = WALK_DISTANCE_M
      baseYawRef.current = yawRef.current
      needsInitRef.current = true
      setActive(true)
    })
  }, [characterYawRef, playerPositionRef, worldRef, yawRef])

  useFrame((_, delta) => {
    if (!active || !worldRef.current) return
    // useSceneWalkModeSync(useLayoutEffect)가 world를 스폰 위치로 복원한 뒤 첫 프레임에서 동기화
    if (needsInitRef.current) {
      syncPlayerPosFromWorld(worldRef, playerPositionRef)
      needsInitRef.current = false
    }
    if (!enabled) return

    const phase = phaseRef.current
    phaseTimerRef.current += delta
    const baseYaw = baseYawRef.current

    if (phase === 'lookLeft') {
      const t = Math.min(1, phaseTimerRef.current / LOOK_LEFT_DURATION_S)
      yawRef.current = baseYaw + LOOK_LEFT_ANGLE_RAD * t
      if (phaseTimerRef.current >= LOOK_LEFT_DURATION_S) {
        phaseRef.current = 'lookRight'
        phaseTimerRef.current = 0
      }
    } else if (phase === 'lookRight') {
      const t = Math.min(1, phaseTimerRef.current / LOOK_RIGHT_DURATION_S)
      yawRef.current = baseYaw + LOOK_LEFT_ANGLE_RAD + (LOOK_RIGHT_ANGLE_RAD - LOOK_LEFT_ANGLE_RAD) * t
      if (phaseTimerRef.current >= LOOK_RIGHT_DURATION_S) {
        phaseRef.current = 'lookCenter'
        phaseTimerRef.current = 0
      }
    } else if (phase === 'lookCenter') {
      const t = Math.min(1, phaseTimerRef.current / LOOK_CENTER_DURATION_S)
      const fromYaw = baseYaw + LOOK_RIGHT_ANGLE_RAD
      yawRef.current = fromYaw + (baseYaw - fromYaw) * t
      if (phaseTimerRef.current >= LOOK_CENTER_DURATION_S) {
        phaseRef.current = 'walkForward'
        phaseTimerRef.current = 0
      }
    } else if (phase === 'walkForward') {
      const step = Math.min(walkRemainingRef.current, WALK_SPEED_MPS * delta)
      walkRemainingRef.current -= step
      moveForward(playerPositionRef, yawRef, step, collisionOverrides)
      worldRef.current.position.x = -playerPositionRef.current[0]
      worldRef.current.position.z = -playerPositionRef.current[1]
      if (walkRemainingRef.current <= 0) {
        phaseRef.current = 'done'
        setActive(false)
      }
    }

    characterYawRef.current = yawRef.current + Math.PI
  })

  return active
}

export function syncPlayerPositionFromWorldRef(
  worldRef: RefObject<Group | null>,
  playerPositionRef: RefObject<Point2 | [number, number]>,
) {
  syncPlayerPosFromWorld(worldRef, playerPositionRef as RefObject<[number, number]>)
}
