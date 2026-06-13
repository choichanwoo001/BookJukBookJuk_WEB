import { DoubleSide } from 'three'
import type { Point2 } from '../../data/floorPlan'
import { NAV_ROUTE_Y } from '../../config/constants'

export function ScenarioRoutePlaybackMarker({
  position,
}: {
  position: Point2
}) {
  const [x, z] = position
  return (
    <group userData={{ excludeCameraCollision: true }} position={[x, NAV_ROUTE_Y + 0.04, z]}>
      <mesh>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial color="#ffdc32" depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.22, 24]} />
        <meshBasicMaterial
          color="rgba(255,220,50,0.85)"
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
