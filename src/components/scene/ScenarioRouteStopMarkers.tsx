import type { DemoScenarioRoute } from '../../utils/demoScenarioRoute'
import { NAV_ROUTE_Y } from '../../config/constants'

const STOP_COLORS: Record<string, string> = {
  spawn: '#ffe566',
  book: '#9ecbff',
  checkout: '#ff8fab',
}

const ACTIVE_COLOR = '#7ee8a0'

export function ScenarioRouteStopMarkers({
  route,
  activeStopIndex,
}: {
  route: DemoScenarioRoute
  activeStopIndex: number
}) {
  return (
    <group userData={{ excludeCameraCollision: true }}>
      {route.stops.map((stop, idx) => {
        const isActive = idx === activeStopIndex
        const fill = isActive ? ACTIVE_COLOR : (STOP_COLORS[stop.kind] ?? '#9ecbff')
        const [x, z] = stop.goal
        const scale = isActive ? 1.25 : 1
        return (
          <group key={stop.id} position={[x, NAV_ROUTE_Y + 0.01, z]} scale={scale}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.22, 24]} />
              <meshBasicMaterial color={fill} transparent opacity={0.92} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.06, 0]}>
              <sphereGeometry args={[0.1, 12, 12]} />
              <meshBasicMaterial color={fill} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
