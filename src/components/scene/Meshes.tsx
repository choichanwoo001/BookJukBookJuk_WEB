import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh as ThreeMesh,
  MeshStandardMaterial,
  Object3D,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  wallPolylines,
  FLOOR_HEIGHT_M,
  type WallRect,
} from '../../data/floorPlan'
import { pointInAnyRect } from '../../utils/rectUtils'
import { buildFillGeometriesClippedToValidFloor, getFloorOuterAndHolePolygons } from '../../utils/floorPolygon'
import {
  wallMaterial,
  SURFACE_WALL_OVERLAP_M,
  WALL_SEGMENT_THICKNESS_M,
  selectedOverlayMaterial,
  selectedWireMaterial,
} from '../../config/constants'
import type { FixtureRenderInstance } from '../../types/scene'
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

export function FloorPolygonMesh({
  yOffset,
  material,
  fillRects,
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  yOffset: number
  material: MeshStandardMaterial
  fillRects?: WallRect[]
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const geometry = useMemo(() => {
    if (wallPolylines.length === 0) return new BufferGeometry()

    const { outer: outerPts, holes: holePolys } = getFloorOuterAndHolePolygons(wallPolylines)
    if (outerPts.length < 3) return new BufferGeometry()

    const shape = new Shape()
    shape.moveTo(outerPts[0][0], outerPts[0][1])
    for (let i = 1; i < outerPts.length; i++) {
      shape.lineTo(outerPts[i][0], outerPts[i][1])
    }
    shape.closePath()

    for (const holePts of holePolys) {
      const hole = new Path()
      hole.moveTo(holePts[0][0], holePts[0][1])
      for (let j = 1; j < holePts.length; j++) {
        hole.lineTo(holePts[j][0], holePts[j][1])
      }
      hole.closePath()
      shape.holes.push(hole)
    }

    const shapeGeo = new ShapeGeometry(shape)
    const pos = shapeGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getY(i)
      pos.setXYZ(i, x, yOffset, z)
    }
    pos.needsUpdate = true
    shapeGeo.computeVertexNormals()

    if (!fillRects || fillRects.length === 0) return shapeGeo

    const fillGeos = buildFillGeometriesClippedToValidFloor(fillRects, outerPts, holePolys, yOffset)
    if (fillGeos.length === 0) return shapeGeo
    return mergeGeometries([shapeGeo, ...fillGeos]) ?? shapeGeo
  }, [yOffset, fillRects])

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerDown={onPointerDown}
    />
  )
}

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

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || rects.length === 0) return
    const geo = mesh.geometry
    const n = rects.length
    let attr = geo.getAttribute('instanceOpacity') as InstancedBufferAttribute | undefined
    if (!attr || attr.count !== n) {
      attr = new InstancedBufferAttribute(new Float32Array(n), 1)
      attr.setUsage(DynamicDrawUsage)
      geo.setAttribute('instanceOpacity', attr)
    }
    for (let i = 0; i < n; i++) {
      attr.setX(i, 1)
    }
    attr.needsUpdate = true
  }, [rects.length])

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

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || instances.length === 0) return
    const geo = mesh.geometry
    const n = instances.length
    let attr = geo.getAttribute('instanceOpacity') as InstancedBufferAttribute | undefined
    if (!attr || attr.count !== n) {
      attr = new InstancedBufferAttribute(new Float32Array(n), 1)
      attr.setUsage(DynamicDrawUsage)
      geo.setAttribute('instanceOpacity', attr)
    }
    for (let i = 0; i < n; i++) {
      attr.setX(i, 1)
    }
    attr.needsUpdate = true
  }, [instances.length])

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
