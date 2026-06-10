import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import type { RefObject } from 'react'
import {
  playerSkinMaterial,
  playerHairMaterial,
  playerShirtMaterial,
  playerPantsMaterial,
  playerShoesMaterial,
  playerFaceFeatureMaterial,
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
  visible = true,
  scaleMultiplier = 1,
}: {
  characterYawRef: RefObject<number>
  worldRef: RefObject<Group | null>
  visible?: boolean
  scaleMultiplier?: number
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
    const yawSnapRad = 0.02
    if (Math.abs(diff) < yawSnapRad) {
      displayYawRef.current = targetYaw
    } else {
      displayYawRef.current += diff * (1 - Math.exp(-delta * 26))
    }
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
    <group
      ref={avatarRef}
      position={[0, 0, 0]}
      scale={[
        PLAYER_SCALE * scaleMultiplier,
        PLAYER_SCALE * scaleMultiplier,
        PLAYER_SCALE * scaleMultiplier,
      ]}
      visible={visible}
      userData={{ excludeCameraCollision: true }}
    >
      <group ref={bodyRef}>
        {/* 머리 — 살짝 세로로 긴 형태, 정수리 약 1.64m */}
        <mesh position={[0, 1.53, 0]} scale={[0.95, 1.08, 1]}>
          <sphereGeometry args={[0.105, 20, 20]} />
          <primitive object={playerSkinMaterial} attach="material" />
        </mesh>
        {/* 머리카락 — 살짝 크게 뒤·위로 치우친 캡 (앞면 -Z는 피부 노출) */}
        <mesh position={[0, 1.555, 0.022]} scale={[1.0, 1.04, 1.0]}>
          <sphereGeometry args={[0.107, 20, 20]} />
          <primitive object={playerHairMaterial} attach="material" />
        </mesh>
        {/* 로컬 -Z = 카메라 정면(Three.js 기본 시선); 눈·코·입으로 방향 구분 */}
        <group position={[0, 1.53, 0]}>
          <mesh position={[-0.036, 0.018, -0.092]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <primitive object={playerFaceFeatureMaterial} attach="material" />
          </mesh>
          <mesh position={[0.036, 0.018, -0.092]}>
            <sphereGeometry args={[0.016, 8, 8]} />
            <primitive object={playerFaceFeatureMaterial} attach="material" />
          </mesh>
          <mesh position={[0, -0.012, -0.102]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <primitive object={playerSkinMaterial} attach="material" />
          </mesh>
          <mesh position={[0, -0.048, -0.088]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.045, 0.008, 0.006]} />
            <primitive object={playerFaceFeatureMaterial} attach="material" />
          </mesh>
        </group>
        {/* 목 */}
        <mesh position={[0, 1.435, 0]}>
          <cylinderGeometry args={[0.042, 0.046, 0.09, 12]} />
          <primitive object={playerSkinMaterial} attach="material" />
        </mesh>
        {/* 상체 — 어깨가 넓고 허리로 좁아지는 셔츠 (앞뒤로 납작) */}
        <mesh position={[0, 1.19, 0]} scale={[1, 1, 0.7]}>
          <cylinderGeometry args={[0.14, 0.105, 0.46, 16]} />
          <primitive object={playerShirtMaterial} attach="material" />
        </mesh>
        {/* 어깨 라운딩 */}
        <mesh position={[-0.155, 1.38, 0]} scale={[1, 0.85, 0.85]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <primitive object={playerShirtMaterial} attach="material" />
        </mesh>
        <mesh position={[0.155, 1.38, 0]} scale={[1, 0.85, 0.85]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <primitive object={playerShirtMaterial} attach="material" />
        </mesh>
        {/* 골반 — 바지 */}
        <mesh position={[0, 0.96, 0]} scale={[1, 1, 0.75]}>
          <cylinderGeometry args={[0.105, 0.115, 0.16, 16]} />
          <primitive object={playerPantsMaterial} attach="material" />
        </mesh>
        {/* 왼팔 — 어깨 pivot, 살짝 바깥으로 벌림 */}
        <group ref={leftArmRef} position={[-0.195, 1.37, 0]} rotation={[0, 0, -0.08]}>
          <mesh position={[0, -0.14, 0]}>
            <cylinderGeometry args={[0.042, 0.038, 0.3, 10]} />
            <primitive object={playerShirtMaterial} attach="material" />
          </mesh>
          {/* 팔꿈치 아래 — 살짝 앞으로 굽힘 */}
          <group position={[0, -0.29, 0]} rotation={[0.22, 0, 0]}>
            <mesh position={[0, -0.12, 0]}>
              <cylinderGeometry args={[0.034, 0.03, 0.26, 10]} />
              <primitive object={playerSkinMaterial} attach="material" />
            </mesh>
            <mesh position={[0, -0.27, 0]}>
              <sphereGeometry args={[0.038, 10, 10]} />
              <primitive object={playerSkinMaterial} attach="material" />
            </mesh>
          </group>
        </group>
        {/* 오른팔 */}
        <group ref={rightArmRef} position={[0.195, 1.37, 0]} rotation={[0, 0, 0.08]}>
          <mesh position={[0, -0.14, 0]}>
            <cylinderGeometry args={[0.042, 0.038, 0.3, 10]} />
            <primitive object={playerShirtMaterial} attach="material" />
          </mesh>
          <group position={[0, -0.29, 0]} rotation={[0.22, 0, 0]}>
            <mesh position={[0, -0.12, 0]}>
              <cylinderGeometry args={[0.034, 0.03, 0.26, 10]} />
              <primitive object={playerSkinMaterial} attach="material" />
            </mesh>
            <mesh position={[0, -0.27, 0]}>
              <sphereGeometry args={[0.038, 10, 10]} />
              <primitive object={playerSkinMaterial} attach="material" />
            </mesh>
          </group>
        </group>
        {/* 왼다리 — 엉덩이 pivot */}
        <group ref={leftLegRef} position={[-0.09, 0.88, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.058, 0.05, 0.4, 12]} />
            <primitive object={playerPantsMaterial} attach="material" />
          </mesh>
          <mesh position={[0, -0.57, 0]}>
            <cylinderGeometry args={[0.045, 0.038, 0.38, 12]} />
            <primitive object={playerPantsMaterial} attach="material" />
          </mesh>
          {/* 신발 — 앞코가 -Z(정면) 방향 */}
          <mesh position={[0, -0.845, -0.045]}>
            <boxGeometry args={[0.095, 0.07, 0.23]} />
            <primitive object={playerShoesMaterial} attach="material" />
          </mesh>
        </group>
        {/* 오른다리 */}
        <group ref={rightLegRef} position={[0.09, 0.88, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.058, 0.05, 0.4, 12]} />
            <primitive object={playerPantsMaterial} attach="material" />
          </mesh>
          <mesh position={[0, -0.57, 0]}>
            <cylinderGeometry args={[0.045, 0.038, 0.38, 12]} />
            <primitive object={playerPantsMaterial} attach="material" />
          </mesh>
          <mesh position={[0, -0.845, -0.045]}>
            <boxGeometry args={[0.095, 0.07, 0.23]} />
            <primitive object={playerShoesMaterial} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  )
}
