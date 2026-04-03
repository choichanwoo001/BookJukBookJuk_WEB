import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  Path,
  ShapeGeometry,
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
import { getFloorOuterAndHolePolygons, getFillRectsClippedToValidFloor } from '../../utils/floorPolygon'
import {
  wallMaterial,
  SURFACE_WALL_OVERLAP_M,
} from '../../config/constants'
import type { FixtureRenderInstance } from '../../types/scene'

/** Grid step for clipping manual floor fill rects to outer − void (meters). */
const FLOOR_FILL_CLIP_CELL_M = 0.14

export function WallRibbonMesh({
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const wallGeometry = useMemo(() => {
    const yBottom = -SURFACE_WALL_OVERLAP_M
    const yTop = FLOOR_HEIGHT_M + SURFACE_WALL_OVERLAP_M
    const positions: number[] = []
    const indices: number[] = []

    for (const loop of wallPolylines) {
      if (loop.length < 2) continue
      const base = positions.length / 3
      for (const [x, z] of loop) {
        positions.push(x, yBottom, z)
        positions.push(x, yTop, z)
      }
      const n = loop.length
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const b0 = base + i * 2
        const t0 = base + i * 2 + 1
        const b1 = base + next * 2
        const t1 = base + next * 2 + 1
        indices.push(b0, b1, t1, b0, t1, t0)
      }
    }

    const geo = new BufferGeometry()
    if (positions.length === 0) {
      geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
      return geo
    }
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh
      geometry={wallGeometry}
      material={wallMaterial}
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

    const clippedCells = getFillRectsClippedToValidFloor(
      fillRects,
      outerPts,
      holePolys,
      FLOOR_FILL_CLIP_CELL_M,
    )
    const fillGeos = clippedCells.map((c) => {
      const g = new PlaneGeometry(c.w, c.d)
      g.rotateX(-Math.PI / 2)
      g.translate(c.cx, yOffset, c.cz)
      return g
    })
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
  const matrix = useMemo(() => new Matrix4(), [])
  const geometry = useMemo(() => new CylinderGeometry(0.5, 0.5, 1, 16), [])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const radius = Math.min(r.w, r.d)
      matrix.makeScale(radius, height, radius)
      matrix.setPosition(r.cx, yOffset + height * 0.5, r.cz)
      meshRef.current.setMatrixAt(i, matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [height, matrix, rects, yOffset])

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
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

export function RotatedFixtureInstances({
  instances,
  material,
  onDoubleClick,
  onClick,
  onPointerDown,
}: {
  instances: FixtureRenderInstance[]
  material: MeshStandardMaterial
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < instances.length; i++) {
      const s = instances[i]
      matrix.makeRotationY(s.yaw)
      const scale = new Matrix4().makeScale(s.w, s.h, s.d)
      matrix.multiply(scale)
      matrix.setPosition(s.cx, s.h * 0.5, s.cz)
      meshRef.current.setMatrixAt(i, matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [instances, matrix])

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
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

const selectedOverlayMaterial = new MeshStandardMaterial({
  color: '#4FC3F7',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  side: 2,
})

const selectedWireMaterial = new MeshStandardMaterial({
  color: '#4FC3F7',
  wireframe: true,
  transparent: true,
  opacity: 0.7,
  side: 2,
})

export function SelectedBookshelfOverlay({ instance }: { instance: FixtureRenderInstance }) {
  const { cx, cz, w, h, d, yaw } = instance
  return (
    <group position={[cx, h * 0.5, cz]} rotation={[0, yaw, 0]}>
      <mesh scale={[w + 0.08, h + 0.08, d + 0.08]}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={selectedOverlayMaterial} attach="material" />
      </mesh>
      <mesh scale={[w + 0.1, h + 0.1, d + 0.1]}>
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
