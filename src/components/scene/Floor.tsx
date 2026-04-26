import { useMemo } from 'react'
import {
  BufferGeometry,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ThreeEvent } from '@react-three/fiber'
import {
  FLOOR_HEIGHT_M,
  type WallRect,
  wallPolylines,
} from '../../data/floorPlan'
import { pointInAnyRect } from '../../utils/rectUtils'
import { buildFillGeometriesClippedToValidFloor, getFloorOuterAndHolePolygons } from '../../utils/floorPolygon'

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
