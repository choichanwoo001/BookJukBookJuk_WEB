import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Group, Vector2 } from 'three'
import { useFrame } from '@react-three/fiber'
import {
  floorRects as baseFloorRects,
  wallRects,
  allBookshelfCollisionRects,
  bookshelfPolygons,
  pillarRects,
  PLAYER_RADIUS_M,
  SPAWN_POINT_WORLD,
} from '../data/floorPlan'
import {
  THIRD_PERSON_KEYBOARD_YAW_RAD_PER_SEC,
  WALK_SPEED_MPS,
  SPAWN_SEARCH_MAX_RADIUS,
  SPAWN_SEARCH_STEP,
  SPAWN_GRID_FALLBACK_STEP,
} from '../config/constants'
import { pointInAnyRect } from '../utils/rectUtils'
import { pointInAnyPolygon } from '../utils/polygonCollision'

type KeyState = {
  keyW: boolean
  keyA: boolean
  keyS: boolean
  keyD: boolean
}

function normalizeVector(x: number, y: number) {
  const vector = new Vector2(x, y)
  if (vector.lengthSq() > 1) vector.normalize()
  return vector
}

function canOccupy(point: [number, number]) {
  if (!pointInAnyRect(baseFloorRects, point[0], point[1])) return false
  if (pointInAnyRect(wallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyRect(allBookshelfCollisionRects, point[0], point[1], PLAYER_RADIUS_M)) return false
  if (pointInAnyPolygon(bookshelfPolygons, point[0], point[1], PLAYER_RADIUS_M)) return false
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

  // Fallback: floorRects 격자 검색 (방사형 검색이 실패한 경우)
  // SPAWN_POINT_WORLD에 가까운 후보부터 시도하기 위해 거리순 정렬.
  let best: { pos: [number, number]; dist: number } | null = null
  for (const rect of baseFloorRects) {
    const halfW = rect.w * 0.5
    const halfD = rect.d * 0.5
    const minX = rect.cx - halfW
    const maxX = rect.cx + halfW
    const minZ = rect.cz - halfD
    const maxZ = rect.cz + halfD
    for (let x = minX + SPAWN_GRID_FALLBACK_STEP * 0.5; x <= maxX; x += SPAWN_GRID_FALLBACK_STEP) {
      for (let z = minZ + SPAWN_GRID_FALLBACK_STEP * 0.5; z <= maxZ; z += SPAWN_GRID_FALLBACK_STEP) {
        const candidate: [number, number] = [x, z]
        if (!canOccupy(candidate)) continue
        const dx = x - SPAWN_POINT_WORLD[0]
        const dz = z - SPAWN_POINT_WORLD[1]
        const dist = dx * dx + dz * dz
        if (!best || dist < best.dist) {
          best = { pos: candidate, dist }
        }
      }
    }
  }
  if (best) return best.pos

  // 마지막 fallback: 원점 대신 SPAWN_POINT_WORLD 자체를 반환 (충돌해도 [0,0]보다 안전).
  if (typeof console !== 'undefined') {
    console.warn(
      '[useWorldMovement] findSpawnPosition: no walkable spawn found; using SPAWN_POINT_WORLD as-is',
      SPAWN_POINT_WORLD,
    )
  }
  return [...SPAWN_POINT_WORLD] as [number, number]
}

export const INITIAL_PLAYER_POS = findSpawnPosition()

// TODO(diagnose): remove after movement bug is confirmed fixed
if (typeof window !== 'undefined') {
  const probeStep = 0.05
  const probes: Array<[string, [number, number]]> = [
    ['+X', [INITIAL_PLAYER_POS[0] + probeStep, INITIAL_PLAYER_POS[1]]],
    ['-X', [INITIAL_PLAYER_POS[0] - probeStep, INITIAL_PLAYER_POS[1]]],
    ['+Z', [INITIAL_PLAYER_POS[0], INITIAL_PLAYER_POS[1] + probeStep]],
    ['-Z', [INITIAL_PLAYER_POS[0], INITIAL_PLAYER_POS[1] - probeStep]],
  ]
  console.log('[useWorldMovement] spawn diagnostics', {
    SPAWN_POINT_WORLD,
    INITIAL_PLAYER_POS,
    spawnCanOccupy: canOccupy(INITIAL_PLAYER_POS),
    probes: Object.fromEntries(probes.map(([k, p]) => [k, canOccupy(p)])),
  })
}

type DynamicCollisionOverrides = {
  floorRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  wallRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  bookshelfRects?: Array<{ cx: number; cz: number; w: number; d: number }>
  bookshelfPolygons?: Array<Array<[number, number]>>
}

export function useWorldMovement(
  worldRef: RefObject<Group | null>,
  yawRef?: RefObject<number>,
  enabled = true,
  overrides?: DynamicCollisionOverrides,
  characterYawRef?: RefObject<number>,
  movingRef?: RefObject<boolean>,
) {
  const keyStateRef = useRef<KeyState>({
    keyW: false,
    keyA: false,
    keyS: false,
    keyD: false,
  })
  const playerPositionRef = useRef<[number, number]>(INITIAL_PLAYER_POS)
  // TODO(diagnose): remove after movement bug is confirmed fixed
  const diagSeenWRef = useRef(false)
  const diagSeenSRef = useRef(false)
  const diagLastFrameLogSecRef = useRef(-1)

  useEffect(() => {
    const updateKeyState = (code: string, pressed: boolean) => {
      if (code === 'KeyW') {
        keyStateRef.current.keyW = pressed
        if (pressed && !diagSeenWRef.current) {
          diagSeenWRef.current = true
          console.log('[useWorldMovement] first KeyW received')
        }
      }
      if (code === 'KeyA') keyStateRef.current.keyA = pressed
      if (code === 'KeyS') {
        keyStateRef.current.keyS = pressed
        if (pressed && !diagSeenSRef.current) {
          diagSeenSRef.current = true
          console.log('[useWorldMovement] first KeyS received')
        }
      }
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

  useFrame((state, delta) => {
    if (!worldRef.current || !enabled) return

    const effectiveFloorRects = overrides?.floorRects ?? baseFloorRects
    const effectiveWallRects = overrides?.wallRects ?? wallRects
    const effectiveBookshelfRects = overrides?.bookshelfRects ?? allBookshelfCollisionRects
    const effectiveBookshelfPolygons = overrides?.bookshelfPolygons ?? bookshelfPolygons
    const canOccupyWithOverrides = (point: [number, number]) => {
      if (!pointInAnyRect(effectiveFloorRects, point[0], point[1])) return false
      if (pointInAnyRect(effectiveWallRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(effectiveBookshelfRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyPolygon(effectiveBookshelfPolygons, point[0], point[1], PLAYER_RADIUS_M)) return false
      if (pointInAnyRect(pillarRects, point[0], point[1], PLAYER_RADIUS_M)) return false
      return true
    }

    const key = keyStateRef.current
    if (yawRef) {
      const turn = (key.keyD ? 1 : 0) + (key.keyA ? -1 : 0)
      yawRef.current -= turn * THIRD_PERSON_KEYBOARD_YAW_RAD_PER_SEC * delta
    }
    const moveZ = (key.keyS ? 1 : 0) + (key.keyW ? -1 : 0)
    const localDirection = normalizeVector(0, moveZ)
    const yaw = yawRef?.current ?? 0
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)
    const direction = new Vector2(
      localDirection.x * cosYaw + localDirection.y * sinYaw,
      -localDirection.x * sinYaw + localDirection.y * cosYaw,
    )
    const current = playerPositionRef.current
    const step = WALK_SPEED_MPS * delta

    const beforeX = current[0]
    const beforeZ = current[1]

    let xPassed = false
    let zPassed = false
    // 작은 step으로 재시도해서 코너·기둥 옆 미세 박힘에서 빠져나오기.
    const SLIDE_SCALES = [1, 0.5, 0.25]
    for (const scale of SLIDE_SCALES) {
      const sx = direction.x * step * scale
      const sz = direction.y * step * scale

      const xCandidate: [number, number] = [current[0] + sx, current[1]]
      const xOk = canOccupyWithOverrides(xCandidate)
      if (xOk) current[0] = xCandidate[0]

      const zCandidate: [number, number] = [current[0], current[1] + sz]
      const zOk = canOccupyWithOverrides(zCandidate)
      if (zOk) current[1] = zCandidate[1]

      if (current[0] !== beforeX || current[1] !== beforeZ) {
        xPassed = xOk
        zPassed = zOk
        break
      }
    }

    worldRef.current.position.x = -current[0]
    worldRef.current.position.z = -current[1]

    const isMoving = direction.x !== 0 || direction.y !== 0
    if (movingRef) movingRef.current = isMoving

    // TODO(diagnose): remove after movement bug is confirmed fixed
    const wOrSPressed = key.keyW || key.keyS
    if (wOrSPressed) {
      const sec = Math.floor(state.clock.elapsedTime)
      if (diagLastFrameLogSecRef.current !== sec) {
        diagLastFrameLogSecRef.current = sec
        const moved = current[0] !== beforeX || current[1] !== beforeZ
        console.log('[useWorldMovement] WS frame', {
          keyW: key.keyW,
          keyS: key.keyS,
          yaw: yaw.toFixed(3),
          dir: [direction.x.toFixed(3), direction.y.toFixed(3)],
          step: step.toFixed(4),
          before: [beforeX.toFixed(3), beforeZ.toFixed(3)],
          after: [current[0].toFixed(3), current[1].toFixed(3)],
          xPassed,
          zPassed,
          moved,
        })
      }
    }

    if (characterYawRef && yawRef) {
      characterYawRef.current = yawRef.current
    }
  })
}
