import { startTransition, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { subscribeMapCommand, subscribeNavigationSync, subscribeMobilityHold } from '../agent/runtime/agentEventBus'
import { isDemoMode } from '../config/demoMode'
import {
  NAV_ARRIVAL_RADIUS_M,
  NAV_HEADING_LOOK_AHEAD_M,
  NAV_HEADING_SMOOTH_LAMBDA,
  NAV_POSITION_SMOOTH_LAMBDA,
  ROBOT_BODY_YAW_SMOOTHING,
  ROBOT_HEADING_SMOOTHING,
  ROBOT_MOVE_DIRECTION_EPSILON_M,
  ROBOT_POSITION_SMOOTHING,
  ROBOT_SYNC_HARD_SNAP_DISTANCE_M,
  ROBOT_SYNC_SNAP_DISTANCE_M,
  WALK_SPEED_MPS,
} from '../config/constants'
import type { Point2 } from '../data/floorPlan'
import type { VersoStatus } from '../lib/verso/types'
import {
  pathLengthM,
  projectPointOntoPathDistance,
  samplePathAtDistance,
} from '../utils/pathSampling'
import { smoothPathForDisplay } from '../utils/pathSmoothing'
import {
  createRobotMotionBuffer,
  pushRobotStatus,
  resetRobotMotionBuffer,
  sampleRobotMotion,
} from '../utils/robotMotionBuffer'

function smoothingAlpha(delta: number, lambda: number): number {
  return 1 - Math.exp(-delta * lambda)
}

function normalizeAngle(a: number): number {
  let n = a
  while (n > Math.PI) n -= Math.PI * 2
  while (n < -Math.PI) n += Math.PI * 2
  return n
}

function lerpAngle(current: number, target: number, alpha: number): number {
  return current + normalizeAngle(target - current) * alpha
}

function robotStatusKey(status: VersoStatus): string {
  return `${status.x},${status.y},${status.heading},${status.isMoving}`
}

/**
 * 자동 이동 통합 훅.
 * 좌표 소스만 분기됨:
 *   - robotSyncActive = true  → 로봇 status (motion buffer 보간)
 *   - robotSyncActive = false → A* 경로 배열 (Catmull-Rom 곡선 리샘플)
 * 이동·yaw 보간 로직은 양쪽 동일.
 */
export function useNavigationMovement({
  worldRef,
  yawRef,
  characterYawRef,
  playerPositionRef,
  storedWorldPositionRef,
  playerWorldXzRef,
  robotSyncActive,
  robotStatus,
  robotLiveStatusRef,
  highlightPath,
  currentGoal,
  demoNavigationActive,
  mobilityHold,
  isWalkMode,
}: {
  worldRef: RefObject<Group | null>
  yawRef: RefObject<number>
  characterYawRef: RefObject<number>
  playerPositionRef: RefObject<[number, number]>
  storedWorldPositionRef: RefObject<[number, number]>
  playerWorldXzRef?: RefObject<Point2 | null>
  robotSyncActive: boolean
  robotStatus: VersoStatus | null
  robotLiveStatusRef?: RefObject<VersoStatus | null>
  highlightPath: Point2[] | null | undefined
  currentGoal: Point2 | null | undefined
  demoNavigationActive: boolean
  mobilityHold: boolean
  isWalkMode: boolean
}): boolean {
  // ----- 경로 모드 상태 -----
  const [pathActive, setPathActive] = useState(false)
  const smoothedPathRef = useRef<Point2[]>([])
  const totalLengthRef = useRef(0)
  const distanceRef = useRef(0)
  const pendingStartRef = useRef(false)
  const mobilityHoldRef = useRef(mobilityHold)

  // ----- 로봇 모드 상태 -----
  const motionBufferRef = useRef(createRobotMotionBuffer())
  const snapOnNextFrameRef = useRef(true)
  const previousDisplayedWorldXzRef = useRef<Point2 | null>(null)
  const robotIsMovingRef = useRef(false)
  const lastPushedStatusKeyRef = useRef<string | null>(null)

  const pathEnabled = isWalkMode && demoNavigationActive && !robotSyncActive

  // mobilityHold prop을 ref에 동기화 (useFrame 에서 최신 값 읽기용)
  useEffect(() => {
    mobilityHoldRef.current = mobilityHold
  }, [mobilityHold])

  // NavigationSync / mobility-hold 버스에서 mobilityHold 구독 (후자는 동기 반영)
  useEffect(() => {
    return subscribeNavigationSync((sync) => {
      mobilityHoldRef.current = sync.mobilityHold
    })
  }, [])

  useEffect(() => {
    return subscribeMobilityHold((held) => {
      mobilityHoldRef.current = held
    })
  }, [])

  // 경로 모드 활성화 여부 동기화
  useEffect(() => {
    if (!pathEnabled) {
      startTransition(() => setPathActive(false))
      return
    }
    if (pendingStartRef.current) {
      pendingStartRef.current = false
      startTransition(() => setPathActive(true))
    }
  }, [pathEnabled])

  // START_NAVIGATION / PAUSE_MOBILITY 커맨드 수신
  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'START_NAVIGATION' && isDemoMode()) {
        distanceRef.current = 0
        pendingStartRef.current = true
        if (pathEnabled) {
          pendingStartRef.current = false
          startTransition(() => setPathActive(true))
        }
      }
      if (command.type === 'PAUSE_MOBILITY') {
        pendingStartRef.current = false
        startTransition(() => setPathActive(false))
      }
      if (command.type === 'RESUME_MOBILITY' && isDemoMode()) {
        if (pathEnabled) {
          startTransition(() => setPathActive(true))
        } else {
          pendingStartRef.current = true
        }
      }
    })
  }, [pathEnabled])

  // 새 경로 수신 → Catmull-Rom 곡선 리샘플 후 저장, 거리 리셋
  useEffect(() => {
    if (!highlightPath || highlightPath.length < 2) return
    const smoothed = smoothPathForDisplay(highlightPath)
    smoothedPathRef.current = smoothed
    totalLengthRef.current = pathLengthM(smoothed)
    const pos = playerPositionRef.current
    distanceRef.current = projectPointOntoPathDistance(smoothed, [pos[0], pos[1]])
    if (pathEnabled) startTransition(() => setPathActive(true))
  }, [highlightPath, pathEnabled, playerPositionRef])

  // 로봇 연결 해제 시 버퍼 초기화
  useEffect(() => {
    if (!robotSyncActive) {
      resetRobotMotionBuffer(motionBufferRef.current)
      previousDisplayedWorldXzRef.current = null
      snapOnNextFrameRef.current = true
      lastPushedStatusKeyRef.current = null
    }
  }, [robotSyncActive])

  // walk 모드 진입 시 스냅 플래그 리셋
  useEffect(() => {
    snapOnNextFrameRef.current = true
    previousDisplayedWorldXzRef.current = null
  }, [isWalkMode])

  useFrame((_, delta) => {
    const world = worldRef.current

    // ================================================================
    // 로봇 분기: 로봇 status → motion buffer 보간 → smooth world 이동
    // ================================================================
    if (robotSyncActive) {
      if (mobilityHoldRef.current) return

      const nowMs = performance.now()
      const liveStatus = robotLiveStatusRef?.current ?? robotStatus
      if (liveStatus) {
        const statusKey = robotStatusKey(liveStatus)
        if (statusKey !== lastPushedStatusKeyRef.current) {
          pushRobotStatus(motionBufferRef.current, liveStatus, nowMs)
          lastPushedStatusKeyRef.current = statusKey
        }
      }

      const motionSample = sampleRobotMotion(motionBufferRef.current, nowMs)
      if (!motionSample) return

      const targetWorldXz = motionSample.worldXz
      const targetHeading = motionSample.heading
      robotIsMovingRef.current = motionSample.isMoving

      // walk 모드가 아닐 때는 위치만 기록하고 실제 world 이동 없음
      if (!isWalkMode || !world) {
        storedWorldPositionRef.current = [-targetWorldXz[0], -targetWorldXz[1]]
        if (playerWorldXzRef) playerWorldXzRef.current = [targetWorldXz[0], targetWorldXz[1]]
        playerPositionRef.current[0] = targetWorldXz[0]
        playerPositionRef.current[1] = targetWorldXz[1]
        yawRef.current = targetHeading
        characterYawRef.current = targetHeading + Math.PI
        snapOnNextFrameRef.current = true
        previousDisplayedWorldXzRef.current = null
        return
      }

      const displayedWorldX = -world.position.x
      const displayedWorldZ = -world.position.z
      const dxToTarget = targetWorldXz[0] - displayedWorldX
      const dzToTarget = targetWorldXz[1] - displayedWorldZ
      const distanceToTarget = Math.hypot(dxToTarget, dzToTarget)

      const shouldHardSnap =
        snapOnNextFrameRef.current || distanceToTarget > ROBOT_SYNC_HARD_SNAP_DISTANCE_M
      const shouldSoftSnap = !shouldHardSnap && distanceToTarget > ROBOT_SYNC_SNAP_DISTANCE_M

      if (shouldHardSnap) {
        world.position.set(-targetWorldXz[0], 0, -targetWorldXz[1])
        yawRef.current = targetHeading
        characterYawRef.current = targetHeading + Math.PI
        snapOnNextFrameRef.current = false
      } else {
        const posSmoothing = shouldSoftSnap
          ? ROBOT_POSITION_SMOOTHING * 1.6
          : ROBOT_POSITION_SMOOTHING
        const posAlpha = smoothingAlpha(delta, posSmoothing)
        world.position.x += (-targetWorldXz[0] - world.position.x) * posAlpha
        world.position.z += (-targetWorldXz[1] - world.position.z) * posAlpha

        const headingAlpha = smoothingAlpha(delta, ROBOT_HEADING_SMOOTHING)
        yawRef.current = lerpAngle(yawRef.current, targetHeading, headingAlpha)

        // 실제 이동 방향 기반 바디 yaw (후진 보정)
        const nextX = -world.position.x
        const nextZ = -world.position.z
        const prevXz = previousDisplayedWorldXzRef.current
        const movDx = prevXz ? nextX - prevXz[0] : dxToTarget
        const movDz = prevXz ? nextZ - prevXz[1] : dzToTarget
        const movDist = Math.hypot(movDx, movDz)
        let bodyTargetYaw = targetHeading + Math.PI
        if (robotIsMovingRef.current && movDist > ROBOT_MOVE_DIRECTION_EPSILON_M) {
          const movHeading = Math.atan2(movDz, movDx)
          if (Math.abs(normalizeAngle(targetHeading - movHeading)) > Math.PI / 2) {
            bodyTargetYaw = movHeading + Math.PI
          }
        }
        const bodyAlpha = smoothingAlpha(delta, ROBOT_BODY_YAW_SMOOTHING)
        characterYawRef.current = lerpAngle(characterYawRef.current, bodyTargetYaw, bodyAlpha)
      }

      const currentXz: Point2 = [-world.position.x, -world.position.z]
      previousDisplayedWorldXzRef.current = currentXz
      storedWorldPositionRef.current = [world.position.x, world.position.z]
      playerPositionRef.current[0] = currentXz[0]
      playerPositionRef.current[1] = currentXz[1]
      if (playerWorldXzRef) playerWorldXzRef.current = currentXz
      return
    }

    // ================================================================
    // 경로 분기: Catmull-Rom 곡선 샘플링 → smooth world 이동
    // ================================================================
    if (!pathActive || !pathEnabled || mobilityHoldRef.current || !world) return

    const path = smoothedPathRef.current
    if (path.length < 2) return

    // 목표 도착 판정
    if (currentGoal && distanceRef.current > 0.05) {
      const pos = playerPositionRef.current
      const distToGoal = Math.hypot(pos[0] - currentGoal[0], pos[1] - currentGoal[1])
      if (distToGoal < NAV_ARRIVAL_RADIUS_M) {
        startTransition(() => setPathActive(false))
        return
      }
    }

    const safeDelta = Math.min(delta, 1 / 30)
    distanceRef.current = Math.min(
      totalLengthRef.current,
      distanceRef.current + WALK_SPEED_MPS * safeDelta,
    )

    const sample = samplePathAtDistance(path, distanceRef.current)
    if (!sample) return

    // look-ahead 지점 기준 heading (코너 미리 돌기)
    const lookAheadDist = Math.min(
      totalLengthRef.current,
      distanceRef.current + NAV_HEADING_LOOK_AHEAD_M,
    )
    const headingSample = samplePathAtDistance(path, lookAheadDist)
    const targetHeading = headingSample?.headingRad ?? sample.headingRad

    // yaw lerp
    const headingAlpha = smoothingAlpha(safeDelta, NAV_HEADING_SMOOTH_LAMBDA)
    yawRef.current = lerpAngle(yawRef.current, targetHeading, headingAlpha)
    characterYawRef.current = yawRef.current + Math.PI

    // 위치 lerp (텔레포트 대신 부드러운 추종)
    const posAlpha = smoothingAlpha(safeDelta, NAV_POSITION_SMOOTH_LAMBDA)
    world.position.x += (-sample.point[0] - world.position.x) * posAlpha
    world.position.z += (-sample.point[1] - world.position.z) * posAlpha

    const currentXz: Point2 = [-world.position.x, -world.position.z]
    playerPositionRef.current[0] = currentXz[0]
    playerPositionRef.current[1] = currentXz[1]
    storedWorldPositionRef.current = [world.position.x, world.position.z]
    if (playerWorldXzRef) playerWorldXzRef.current = currentXz

    // 경로 끝 도달
    if (distanceRef.current >= totalLengthRef.current - 1e-4) {
      startTransition(() => setPathActive(false))
    }
  })

  const robotAutoWalkActive = robotSyncActive && (robotStatus?.isMoving ?? false) && !mobilityHold
  return (pathActive && pathEnabled) || robotAutoWalkActive
}
