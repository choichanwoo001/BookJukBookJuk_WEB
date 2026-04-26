import { useLayoutEffect, useRef } from 'react'
import { Group, Mesh as ThreeMesh, MeshStandardMaterial } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  counterBaggingSurfaceMaterial,
  counterCashDrawerMaterial,
  counterFootBlackMaterial,
  counterKellyAccentMaterial,
  counterLoadingSurfaceMaterial,
  counterMonitorBezelMaterial,
  counterOverlayKellyAccentMaterial,
  counterOverlayPedestalMaterial,
  counterPedestalMaterial,
  counterScannerGreyMaterial,
  counterTrimChromeMaterial,
  counterWorkMetalMaterial,
} from '../../config/constants'
import type { FixtureRenderInstance } from '../../types/scene'

/** 마트형 계산대: 좌(적재)·중(스캐너·결제)·우(포장) 구역, 흰 받침·은색 트림·켈리 그린 포인트. */
export function SupermarketCounterInstances({
  instances,
  overlayCandidate,
  disableRaycast,
  onPointerDown,
}: {
  instances: FixtureRenderInstance[]
  /** 책장 후보 오버레이용 — 받침·녹색 톤만 살짝 다르게. */
  overlayCandidate?: boolean
  disableRaycast?: boolean
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const pedestalMat = overlayCandidate ? counterOverlayPedestalMaterial : counterPedestalMaterial
  const kellyMat = overlayCandidate ? counterOverlayKellyAccentMaterial : counterKellyAccentMaterial

  return (
    <>
      {instances.map((inst) => (
        <SupermarketCounterSingle
          key={`${inst.cx}-${inst.cz}-${inst.yaw}-${inst.w}-${inst.d}`}
          inst={inst}
          pedestalMat={pedestalMat}
          kellyMat={kellyMat}
          disableRaycast={disableRaycast}
          onPointerDown={onPointerDown}
        />
      ))}
    </>
  )
}

function SupermarketCounterSingle({
  inst,
  pedestalMat,
  kellyMat,
  disableRaycast,
  onPointerDown,
}: {
  inst: FixtureRenderInstance
  pedestalMat: MeshStandardMaterial
  kellyMat: MeshStandardMaterial
  disableRaycast?: boolean
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const groupRef = useRef<Group>(null)
  const { cx, cz, w, d, h, yaw } = inst

  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.traverse((obj) => {
      if (obj instanceof ThreeMesh) {
        obj.raycast = disableRaycast ? () => {} : ThreeMesh.prototype.raycast.bind(obj)
      }
    })
  }, [disableRaycast])

  const pw = Math.min(Math.max(w * 0.2, 0.11), 0.32)
  const pedH = h * 0.86
  const pedY = pedH * 0.5
  const px = w * 0.5 - pw * 0.5 - 0.008
  const shelfY = 0.075
  const wL = w * 0.36
  const wC = w * 0.28
  const wR = w * 0.36
  const topTh = h * 0.14
  const sideY = h - topTh * 0.5
  const hubH = h * 0.26
  const hubY = h - hubH * 0.5
  const xL = -w * 0.5 + wL * 0.5
  const xC = -w * 0.5 + wL + wC * 0.5
  const xR = w * 0.5 - wR * 0.5
  const dz = d - 0.06

  return (
    <group
      ref={groupRef}
      position={[cx, 0, cz]}
      rotation={[0, yaw, 0]}
      onPointerDown={onPointerDown}
    >
      {/* 받침대 하단 블랙 베이스 */}
      <mesh position={[-px, 0.02, 0]}>
        <boxGeometry args={[pw * 0.92, 0.035, d * 0.88]} />
        <primitive object={counterFootBlackMaterial} attach="material" />
      </mesh>
      <mesh position={[px, 0.02, 0]}>
        <boxGeometry args={[pw * 0.92, 0.035, d * 0.88]} />
        <primitive object={counterFootBlackMaterial} attach="material" />
      </mesh>
      {/* 흰색 기둥 */}
      <mesh position={[-px, pedY, 0]}>
        <boxGeometry args={[pw, pedH, d * 0.9]} />
        <primitive object={pedestalMat} attach="material" />
      </mesh>
      <mesh position={[px, pedY, 0]}>
        <boxGeometry args={[pw, pedH, d * 0.9]} />
        <primitive object={pedestalMat} attach="material" />
      </mesh>
      {/* 하부 연결 선반 */}
      <mesh position={[0, shelfY, 0]}>
        <boxGeometry args={[w * 0.52, 0.055, d * 0.78]} />
        <primitive object={pedestalMat} attach="material" />
      </mesh>
      {/* 좌: 적재대 (짙은 상판) */}
      <mesh position={[xL, sideY, 0]}>
        <boxGeometry args={[wL - 0.02, topTh, dz]} />
        <primitive object={counterLoadingSurfaceMaterial} attach="material" />
      </mesh>
      {/* 중: 스캐너·결제 허브 (은색, 약간 높음) */}
      <mesh position={[xC, hubY, 0]}>
        <boxGeometry args={[wC - 0.02, hubH, dz]} />
        <primitive object={counterWorkMetalMaterial} attach="material" />
      </mesh>
      {/* 스캐너 베드 */}
      <mesh position={[xC, h - 0.02, d * 0.5 - 0.06]}>
        <boxGeometry args={[wC * 0.72, 0.018, d * 0.22]} />
        <primitive object={counterWorkMetalMaterial} attach="material" />
      </mesh>
      {/* 현금 서랍 */}
      <mesh position={[xC, h * 0.82, d * 0.5 - 0.02]}>
        <boxGeometry args={[wC * 0.55, 0.06, 0.04]} />
        <primitive object={counterCashDrawerMaterial} attach="material" />
      </mesh>
      {/* 우: 포장대 */}
      <mesh position={[xR, sideY, 0]}>
        <boxGeometry args={[wR - 0.02, topTh, dz]} />
        <primitive object={counterBaggingSurfaceMaterial} attach="material" />
      </mesh>
      {/* 전면 은색 트림 + 녹색 스트라이프 (고객측 +Z) */}
      <mesh position={[0, h * 0.91, d * 0.5 - 0.012]}>
        <boxGeometry args={[w * 0.96, 0.028, 0.018]} />
        <primitive object={counterTrimChromeMaterial} attach="material" />
      </mesh>
      <mesh position={[0, h * 0.895, d * 0.5 - 0.008]}>
        <boxGeometry args={[w * 0.92, 0.014, 0.014]} />
        <primitive object={kellyMat} attach="material" />
      </mesh>
      {/* 후면 녹색 모니터 스탠드 + 듀얼 모니터 */}
      <mesh position={[xC, h * 0.72, -d * 0.5 + 0.05]}>
        <boxGeometry args={[wC * 0.65, h * 0.38, d * 0.1]} />
        <primitive object={kellyMat} attach="material" />
      </mesh>
      <mesh position={[xC - wC * 0.12, h * 0.88, -d * 0.5 + 0.09]}>
        <boxGeometry args={[w * 0.14, h * 0.1, 0.025]} />
        <primitive object={counterMonitorBezelMaterial} attach="material" />
      </mesh>
      <mesh
        position={[xC + wC * 0.1, h * 0.82, -d * 0.5 + 0.11]}
        rotation={[0.35, 0, 0]}
      >
        <boxGeometry args={[w * 0.1, 0.06, 0.02]} />
        <primitive object={counterMonitorBezelMaterial} attach="material" />
      </mesh>
      {/* 핸드 스캐너 거치 */}
      <mesh position={[xC - wC * 0.35, h * 0.93, -d * 0.5 + 0.07]}>
        <boxGeometry args={[0.04, 0.05, 0.06]} />
        <primitive object={counterScannerGreyMaterial} attach="material" />
      </mesh>
    </group>
  )
}
