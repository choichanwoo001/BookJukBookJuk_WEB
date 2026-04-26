import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Object3D,
  Vector3,
} from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  ENTRANCE_DOORWAY,
  FLOOR_HEIGHT_M,
  wallPolylines,
} from '../../data/floorPlan'
import {
  entranceDoorFrameMaterial,
  entranceDoorLeafMaterial,
  SURFACE_WALL_OVERLAP_M,
  WALL_SEGMENT_THICKNESS_M,
  wallMaterial,
} from '../../config/constants'
import { createPerInstanceOpacityMaterial } from '../../utils/perInstanceOpacityMaterial'

const _dummy = new Object3D()
const _unitX = new Vector3(1, 0, 0)
const _edgeDir = new Vector3()

export function WallRibbonMesh({
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const segmentCount = useMemo(() => {
    let n = 0
    for (const loop of wallPolylines) {
      if (loop.length >= 2) n += loop.length
    }
    return n
  }, [])

  const materialWithOpacity = useMemo(() => createPerInstanceOpacityMaterial(wallMaterial), [])
  const meshRef = useRef<ThreeInstancedMesh>(null)
  /** Strict Mode 등으로 메시가 언마운트될 때 R3F가 geometry를 dispose하면, useMemo 캐시가 죽은 버퍼를 가리킬 수 있어 리비전으로 새로 만든다. */
  const [wallGeomRevision, setWallGeomRevision] = useState(0)
  useLayoutEffect(() => {
    return () => setWallGeomRevision((r) => r + 1)
  }, [])

  const yBottom = -SURFACE_WALL_OVERLAP_M
  const yTop = FLOOR_HEIGHT_M + SURFACE_WALL_OVERLAP_M
  const wallHeight = yTop - yBottom
  const yCenter = (yBottom + yTop) * 0.5

  /** 첫 프레임부터 `instanceOpacity`가 있어야 per-instance 셰이더가 올바르게 바인딩된다. */
  const wallSegmentGeometry = useMemo(() => {
    if (segmentCount === 0) return null
    const g = new BoxGeometry(1, 1, 1)
    const attr = new InstancedBufferAttribute(new Float32Array(segmentCount), 1)
    attr.setUsage(DynamicDrawUsage)
    for (let i = 0; i < segmentCount; i++) {
      attr.setX(i, 1)
    }
    g.setAttribute('instanceOpacity', attr)
    return g
  }, [segmentCount, wallGeomRevision]) // eslint-disable-line react-hooks/exhaustive-deps -- wallGeomRevision: R3F dispose 후 새 BufferGeometry

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || segmentCount === 0) return

    let idx = 0
    for (const loop of wallPolylines) {
      if (loop.length < 2) continue
      const n = loop.length
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const [x0, z0] = loop[i]
        const [x1, z1] = loop[next]
        const dx = x1 - x0
        const dz = z1 - z0
        const L = Math.hypot(dx, dz)
        if (L < 1e-6) {
          _dummy.position.set(x0, yCenter, z0)
          _dummy.scale.set(1e-3, wallHeight, WALL_SEGMENT_THICKNESS_M)
          _dummy.quaternion.identity()
          _dummy.updateMatrix()
          mesh.setMatrixAt(idx, _dummy.matrix)
          idx += 1
          continue
        }
        _edgeDir.set(dx / L, 0, dz / L)
        _dummy.quaternion.setFromUnitVectors(_unitX, _edgeDir)
        _dummy.position.set((x0 + x1) * 0.5, yCenter, (z0 + z1) * 0.5)
        _dummy.scale.set(L, wallHeight, WALL_SEGMENT_THICKNESS_M)
        _dummy.updateMatrix()
        mesh.setMatrixAt(idx, _dummy.matrix)
        idx += 1
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    /** setMatrixAt 후 결합 구가 옛 좌표로 남으면 Raycaster가 intersectSphere에서 바로 return → 가림 미적용 */
    mesh.boundingSphere = null
  }, [segmentCount, wallHeight, yCenter])

  if (segmentCount === 0 || !wallSegmentGeometry) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[wallSegmentGeometry, materialWithOpacity, segmentCount]}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerDown={onPointerDown}
    />
  )
}

/** 맵 벽 폴리곤은 건드리지 않고, `ENTRANCE_DOORWAY` 위치에 문틀·문패널만 겹쳐 둔다 (충돌 없음). */
export function EntranceDoorwayDecor() {
  const quat = useMemo(() => {
    const e = new Vector3(ENTRANCE_DOORWAY.tangentX, 0, ENTRANCE_DOORWAY.tangentZ).normalize()
    const o = new Object3D()
    o.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), e)
    return o.quaternion.clone()
  }, [])

  const {
    centerX,
    centerZ,
    openingWidthM,
    frameHeightM,
    jambThicknessM,
    frameDepthM,
    lintelHeightM,
    doorPanelWidthM,
    doorOpenRad,
  } = ENTRANCE_DOORWAY

  const W = openingWidthM
  const H = frameHeightM
  const T = jambThicknessM
  const D = frameDepthM
  const L = lintelHeightM
  const panelH = Math.max(0.35, H - L - 0.12)

  return (
    <group
      position={[centerX, 0, centerZ]}
      quaternion={quat}
      userData={{ excludeCameraCollision: true }}
    >
      <mesh position={[-W * 0.5 - T * 0.5, H * 0.5, 0]}>
        <boxGeometry args={[T, H, D]} />
        <primitive object={entranceDoorFrameMaterial} attach="material" />
      </mesh>
      <mesh position={[W * 0.5 + T * 0.5, H * 0.5, 0]}>
        <boxGeometry args={[T, H, D]} />
        <primitive object={entranceDoorFrameMaterial} attach="material" />
      </mesh>
      <mesh position={[0, H - L * 0.5, 0]}>
        <boxGeometry args={[W + T * 2, L, D]} />
        <primitive object={entranceDoorFrameMaterial} attach="material" />
      </mesh>
      <group position={[-W * 0.5 + T * 0.55, panelH * 0.5 + 0.06, D * 0.06]} rotation={[0, doorOpenRad, 0]}>
        <mesh>
          <boxGeometry args={[doorPanelWidthM, panelH, 0.045]} />
          <primitive object={entranceDoorLeafMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  )
}
