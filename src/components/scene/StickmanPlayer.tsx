import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import type { RefObject } from 'react'
import {
  playerMaterial,
  PLAYER_SCALE,
  GAIT_BASE_SPEED,
  GAIT_SPEED_MULTIPLIER,
  GAIT_MAX_SPEED_ADD,
  GAIT_SWING_AMPLITUDE,
  GAIT_BOB_AMPLITUDE,
  GAIT_MOVE_THRESHOLD,
} from '../../config/constants'

export function StickmanPlayer({
  characterYawRef,
  worldRef,
}: {
  characterYawRef: RefObject<number>
  worldRef: RefObject<Group | null>
}) {
  const avatarRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const previousWorldPosRef = useRef<Vector3 | null>(null)
  const gaitPhaseRef = useRef(0)
  const gaitBlendRef = useRef(0)
  const displayYawRef = useRef(0)

  useFrame((_, delta) => {
    if (!avatarRef.current) return

    const targetYaw = characterYawRef.current
    let diff = targetYaw - displayYawRef.current
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    displayYawRef.current += diff * (1 - Math.exp(-delta * 14))
    avatarRef.current.rotation.y = displayYawRef.current

    if (!worldRef.current) return

    const worldPos = worldRef.current.position
    const prevWorldPos = previousWorldPosRef.current
    let speed = 0
    if (prevWorldPos) {
      const dx = worldPos.x - prevWorldPos.x
      const dz = worldPos.z - prevWorldPos.z
      speed = Math.hypot(dx, dz) / Math.max(delta, 1e-4)
    }

    if (!prevWorldPos) {
      previousWorldPosRef.current = worldPos.clone()
    } else {
      prevWorldPos.copy(worldPos)
    }

    const isMoving = speed > GAIT_MOVE_THRESHOLD
    const blendTarget = isMoving ? 1 : 0
    const blendLerp = 1 - Math.exp(-delta * 12)
    gaitBlendRef.current += (blendTarget - gaitBlendRef.current) * blendLerp

    const gaitSpeed = GAIT_BASE_SPEED + Math.min(speed * GAIT_SPEED_MULTIPLIER, GAIT_MAX_SPEED_ADD)
    gaitPhaseRef.current += delta * gaitSpeed

    const swing = Math.sin(gaitPhaseRef.current) * GAIT_SWING_AMPLITUDE * gaitBlendRef.current
    const bob = Math.abs(Math.sin(gaitPhaseRef.current * 2)) * GAIT_BOB_AMPLITUDE * gaitBlendRef.current

    if (leftArmRef.current) leftArmRef.current.rotation.x = swing
    if (rightArmRef.current) rightArmRef.current.rotation.x = -swing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -swing * 0.8
    if (rightLegRef.current) rightLegRef.current.rotation.x = swing * 0.8
    if (bodyRef.current) bodyRef.current.position.y = bob
  })

  return (
    <group ref={avatarRef} position={[0, 0, 0]} scale={[PLAYER_SCALE, PLAYER_SCALE, PLAYER_SCALE]}>
      <group ref={bodyRef}>
        <mesh position={[0, 1.52, 0]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <primitive object={playerMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 1.06, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.58, 12]} />
          <primitive object={playerMaterial} attach="material" />
        </mesh>
        <group ref={leftArmRef} position={[-0.18, 1.16, 0]}>
          <mesh position={[0, -0.2, 0]} rotation={[0, 0, Math.PI / 2.9]}>
            <cylinderGeometry args={[0.028, 0.028, 0.48, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.18, 1.16, 0]}>
          <mesh position={[0, -0.2, 0]} rotation={[0, 0, -Math.PI / 2.9]}>
            <cylinderGeometry args={[0.028, 0.028, 0.48, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={leftLegRef} position={[-0.08, 0.8, 0]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.08, 0.8, 0]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  )
}
