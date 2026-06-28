import { useEffect, useMemo, useRef } from 'react'
import {
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  FLOOR_HEIGHT_M,
  type WallRect,
} from '../../data/floorPlan'
import { pointInAnyRect } from '../../utils/rectUtils'

const _floorDummy = new Object3D()

export function FloorPolygonMesh({
  yOffset,
  material,
  rects,
  onDoubleClick,
  onClick,
  onPointerDown,
  onPointerMove,
}: {
  yOffset: number
  material: MeshStandardMaterial
  rects: WallRect[]
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const geometry = useMemo(() => new PlaneGeometry(1, 1), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      _floorDummy.position.set(r.cx, yOffset, r.cz)
      _floorDummy.rotation.set(-Math.PI / 2, 0, 0)
      _floorDummy.scale.set(r.w, r.d, 1)
      _floorDummy.updateMatrix()
      mesh.setMatrixAt(i, _floorDummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.boundingSphere = null
  }, [rects, yOffset])

  if (rects.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, rects.length]}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    />
  )
}

export function BookstoreLights({ floorRenderRects }: { floorRenderRects: WallRect[] }) {
  const positions = useMemo(() => {
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const r of floorRenderRects) {
      minX = Math.min(minX, r.cx - r.w / 2)
      maxX = Math.max(maxX, r.cx + r.w / 2)
      minZ = Math.min(minZ, r.cz - r.d / 2)
      maxZ = Math.max(maxZ, r.cz + r.d / 2)
    }

    const result: [number, number, number][] = []
    const spacing = 10
    const y = FLOOR_HEIGHT_M - 0.5
    for (let x = minX + spacing / 2; x <= maxX; x += spacing) {
      for (let z = minZ + spacing / 2; z <= maxZ; z += spacing) {
        if (pointInAnyRect(floorRenderRects, x, z)) result.push([x, y, z])
      }
    }
    return result
  }, [floorRenderRects])

  return (
    <>
      {positions.map((pos, i) => (
        <pointLight
          key={i}
          position={pos}
          color="#FFE0B2"
          intensity={2.5}
          distance={14}
          decay={2}
        />
      ))}
    </>
  )
}
