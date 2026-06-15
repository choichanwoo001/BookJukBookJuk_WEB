import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Object3D,
} from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  FLOOR_HEIGHT_M,
  wallPolylines,
} from '../../data/floorPlan'
import {
  SURFACE_WALL_OVERLAP_M,
  WALL_SEGMENT_THICKNESS_M,
  wallMaterial,
} from '../../config/constants'
import { createPerInstanceOpacityMaterial } from '../../utils/perInstanceOpacityMaterial'

const _dummy = new Object3D()

type WallSegment = {
  cx: number
  cz: number
  length: number
  yaw: number
}

function buildWallSegments(): WallSegment[] {
  const segments: WallSegment[] = []
  for (const loop of wallPolylines) {
    if (loop.length < 2) continue
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]
      const b = loop[(i + 1) % loop.length]
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const length = Math.hypot(dx, dz)
      if (length < 0.05) continue
      segments.push({
        cx: (a[0] + b[0]) * 0.5,
        cz: (a[1] + b[1]) * 0.5,
        length,
        yaw: Math.atan2(-dz, dx),
      })
    }
  }
  return segments
}

export function WallRibbonMesh({
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const segments = useMemo(() => buildWallSegments(), [])
  const segmentCount = segments.length

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

    for (let idx = 0; idx < segments.length; idx++) {
      const segment = segments[idx]
      _dummy.position.set(segment.cx, yCenter, segment.cz)
      _dummy.rotation.set(0, segment.yaw, 0)
      _dummy.scale.set(
        Math.max(segment.length + WALL_SEGMENT_THICKNESS_M, WALL_SEGMENT_THICKNESS_M),
        wallHeight,
        WALL_SEGMENT_THICKNESS_M,
      )
      _dummy.updateMatrix()
      mesh.setMatrixAt(idx, _dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    /** setMatrixAt 후 결합 구가 옛 좌표로 남으면 Raycaster가 intersectSphere에서 바로 return → 가림 미적용 */
    mesh.boundingSphere = null
  }, [segmentCount, segments, wallHeight, yCenter])

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
