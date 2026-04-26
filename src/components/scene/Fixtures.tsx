import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CylinderGeometry,
  InstancedMesh,
  Mesh as ThreeMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { WallRect } from '../../data/floorPlan'
import {
  selectedOverlayMaterial,
  selectedWireMaterial,
} from '../../config/constants'
import type { FixtureRenderInstance } from '../../types/scene'
import { createPerInstanceOpacityMaterial } from '../../utils/perInstanceOpacityMaterial'
import { useInstanceOpacityAttribute } from '../../hooks/useInstanceOpacityAttribute'

const _dummy = new Object3D()

export function PillarCylinderInstances({
  rects,
  height,
  yOffset,
  material,
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  rects: WallRect[]
  height: number
  yOffset: number
  material: MeshStandardMaterial
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const geometry = useMemo(() => new CylinderGeometry(0.5, 0.5, 1, 16), [])
  const materialWithOpacity = useMemo(() => createPerInstanceOpacityMaterial(material), [material])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const radius = Math.min(r.w, r.d)
      _dummy.position.set(r.cx, yOffset + height * 0.5, r.cz)
      _dummy.scale.set(radius, height, radius)
      _dummy.rotation.set(0, 0, 0)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.boundingSphere = null
  }, [height, rects, yOffset])

  useInstanceOpacityAttribute(meshRef, rects.length)

  if (rects.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, rects.length]}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <primitive object={materialWithOpacity} attach="material" />
    </instancedMesh>
  )
}

export function RotatedFixtureInstances({
  instances,
  material,
  disableRaycast,
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  instances: FixtureRenderInstance[]
  material: MeshStandardMaterial
  disableRaycast?: boolean
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const materialWithOpacity = useMemo(() => createPerInstanceOpacityMaterial(material), [material])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < instances.length; i++) {
      const s = instances[i]
      _dummy.position.set(s.cx, s.h * 0.5, s.cz)
      _dummy.rotation.set(0, s.yaw, 0)
      _dummy.scale.set(s.w, s.h, s.d)
      _dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, _dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.boundingSphere = null
  }, [instances])

  useInstanceOpacityAttribute(meshRef, instances.length)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (disableRaycast) {
      mesh.raycast = () => {}
    } else {
      mesh.raycast = InstancedMesh.prototype.raycast.bind(mesh)
    }
  }, [disableRaycast, instances.length])

  if (instances.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instances.length]}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={materialWithOpacity} attach="material" />
    </instancedMesh>
  )
}

export function SelectedBookshelfOverlay({ instance }: { instance: FixtureRenderInstance }) {
  const { cx, cz, w, h, d, yaw } = instance
  const fillRef = useRef<ThreeMesh>(null)
  const wireRef = useRef<ThreeMesh>(null)

  useLayoutEffect(() => {
    for (const m of [fillRef.current, wireRef.current]) {
      if (m) m.raycast = () => {}
    }
  }, [])

  return (
    <group position={[cx, h * 0.5, cz]} rotation={[0, yaw, 0]}>
      <mesh ref={fillRef} scale={[w + 0.08, h + 0.08, d + 0.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={selectedOverlayMaterial} attach="material" />
      </mesh>
      <mesh ref={wireRef} scale={[w + 0.1, h + 0.1, d + 0.1]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={selectedWireMaterial} attach="material" />
      </mesh>
    </group>
  )
}
