import { Line } from '@react-three/drei'
import { FLOOR_HEIGHT_M, type Point2 } from '../../data/floorPlan'
import {
  SURFACE_WALL_OVERLAP_M,
  wallSelectHighlightMaterial,
  wallSelectMarkerMaterial,
} from '../../config/constants'
import type { WallSegmentRef } from '../../utils/wallSelectBetweenPoints'

function WallSegmentHighlight({ segment }: { segment: WallSegmentRef }) {
  const yCenter = FLOOR_HEIGHT_M * 0.5
  const height = FLOOR_HEIGHT_M + SURFACE_WALL_OVERLAP_M * 2
  const dx = segment.bx - segment.ax
  const dz = segment.bz - segment.az
  const length = Math.hypot(dx, dz)
  const cx = (segment.ax + segment.bx) * 0.5
  const cz = (segment.az + segment.bz) * 0.5
  const yaw = Math.atan2(-dz, dx)

  return (
    <mesh
      position={[cx, yCenter, cz]}
      rotation={[0, yaw, 0]}
      userData={{ excludeCameraCollision: true }}
    >
      <boxGeometry args={[Math.max(length, 0.05), height, 0.14]} />
      <primitive object={wallSelectHighlightMaterial} attach="material" />
    </mesh>
  )
}

export function WallSelectOverlay({
  pointA,
  pointB,
  previewPoint,
  segments,
}: {
  pointA: Point2 | null
  pointB: Point2 | null
  previewPoint: Point2 | null
  segments: WallSegmentRef[]
}) {
  const markerY = 0.12
  const lineY = 0.08

  const previewEnd = pointA && !pointB ? previewPoint : null
  const committedLine = pointA && pointB ? pointB : null

  return (
    <group userData={{ excludeCameraCollision: true }}>
      {pointA && (
        <mesh position={[pointA[0], markerY, pointA[1]]}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <primitive object={wallSelectMarkerMaterial} attach="material" />
        </mesh>
      )}
      {pointB && (
        <mesh position={[pointB[0], markerY, pointB[1]]}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <primitive object={wallSelectMarkerMaterial} attach="material" />
        </mesh>
      )}
      {pointA && previewEnd && (
        <Line
          points={[
            [pointA[0], lineY, pointA[1]],
            [previewEnd[0], lineY, previewEnd[1]],
          ]}
          color="#5ec8ff"
          lineWidth={2}
          dashed
          dashSize={0.25}
          gapSize={0.12}
        />
      )}
      {pointA && committedLine && (
        <Line
          points={[
            [pointA[0], lineY, pointA[1]],
            [committedLine[0], lineY, committedLine[1]],
          ]}
          color="#5ec8ff"
          lineWidth={2.5}
        />
      )}
      {segments.map((segment) => (
        <WallSegmentHighlight
          key={`${segment.loopIndex}-${segment.segmentIndex}`}
          segment={segment}
        />
      ))}
    </group>
  )
}
