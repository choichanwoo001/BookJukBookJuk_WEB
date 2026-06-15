import { useRef } from 'react'
import type { RefObject } from 'react'
import { Group, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEditDragController } from '../../../hooks/useEditDragController'
import type { Point2 } from '../../../data/floorPlan'
import type { FixtureRenderInstance } from '../../../types/scene'
import { worldXzToMinimapUv } from '../../../utils/minimapBounds'

export type MinimapPlayerPos = { u: number; v: number; yaw: number }

export function PlayerPositionReporter({
  worldRef,
  characterYawRef,
  onPlayerPosition,
  robotSyncActive = false,
  playerWorldXzRef,
}: {
  worldRef: RefObject<Group | null>
  characterYawRef: RefObject<number>
  onPlayerPosition: (pos: MinimapPlayerPos | null) => void
  /** 로봇 연동 시 /verso/status 기준 위치를 미니맵에 표시 */
  robotSyncActive?: boolean
  playerWorldXzRef?: RefObject<Point2 | null>
}) {
  const lastEmitRef = useRef(0)
  const lastSentRef = useRef<MinimapPlayerPos | null>(null)
  useFrame((state) => {
    const robotXz = robotSyncActive ? playerWorldXzRef?.current : null
    if (!robotXz && !worldRef.current) {
      if (lastSentRef.current !== null) {
        lastSentRef.current = null
        onPlayerPosition(null)
      }
      return
    }
    const wx = robotXz ? robotXz[0] : -worldRef.current!.position.x
    const wz = robotXz ? robotXz[1] : -worldRef.current!.position.z
    const { u, v } = worldXzToMinimapUv(wx, wz)
    const yaw = characterYawRef.current
    const t = state.clock.elapsedTime
    const next: MinimapPlayerPos = { u, v, yaw }
    const prev = lastSentRef.current
    const moved =
      !prev
      || Math.abs(prev.u - u) > 0.0008
      || Math.abs(prev.v - v) > 0.0008
      || Math.abs(prev.yaw - yaw) > 0.02
    if (!moved && t - lastEmitRef.current < 0.12) return
    lastEmitRef.current = t
    lastSentRef.current = next
    onPlayerPosition(next)
  })
  return null
}

export function PlayerWorldXzReporter({
  worldRef,
  storedWorldPositionRef,
  isWalkMode,
  playerWorldXzRef,
}: {
  worldRef: RefObject<Group | null>
  storedWorldPositionRef: RefObject<[number, number]>
  isWalkMode: boolean
  playerWorldXzRef: RefObject<Point2 | null>
}) {
  useFrame(() => {
    if (isWalkMode && worldRef.current) {
      playerWorldXzRef.current = [-worldRef.current.position.x, -worldRef.current.position.z]
    } else {
      playerWorldXzRef.current = [-storedWorldPositionRef.current[0], -storedWorldPositionRef.current[1]]
    }
  })
  return null
}

export function ForwardArrowUpdater({
  yawRef,
  domRef,
}: {
  yawRef: RefObject<number>
  domRef: RefObject<HTMLDivElement | null>
}) {
  const { camera } = useThree()
  const camFwdVec = useRef(new Vector3())

  useFrame(() => {
    if (!domRef.current) return
    camera.getWorldDirection(camFwdVec.current)
    const fwd = camFwdVec.current
    const cameraYaw = Math.atan2(-fwd.x, -fwd.z)
    let delta = yawRef.current - cameraYaw
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    domRef.current.style.transform = `rotate(${delta}rad)`
  })

  return null
}

export function EditDragController(props: {
  selectedIndex: number | null
  instances: FixtureRenderInstance[]
  onUpdate: (index: number, patch: Partial<FixtureRenderInstance>) => void
  suspend: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  useEditDragController(props)
  return null
}
