import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { Color, DoubleSide } from 'three'
import type { Point2 } from '../../data/floorPlan'
import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'
import {
  NAV_ARRIVAL_RADIUS_M,
  NAV_ARRIVAL_RING_INNER,
  NAV_ARRIVAL_RING_OUTER,
  NAV_HIGHLIGHT_DISTANCE_BLEND_FAR_M,
  NAV_LINE_COLOR_BRIGHT,
  NAV_LINE_COLOR_DIM,
  NAV_LINE_COLOR_HIGHLIGHT_FAR,
  NAV_LINE_OPACITY_BRIGHT,
  NAV_LINE_OPACITY_DIM,
  NAV_LINE_OPACITY_HIGHLIGHT_FAR,
  NAV_LINE_WIDTH_PX,
  NAV_ROUTE_Y,
} from '../../config/constants'

function toLinePoints(path: Point2[], y: number): [number, number, number][] {
  return path.map(([x, z]) => [x, y, z])
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t))
}

/** 목표에 가까울수록 밝은 톤·불투명, 멀수록 보조 톤(플랜: 이동 중 변하는 건 색·투명도만). */
function highlightColorOpacity(distanceM: number | null): { color: string; opacity: number } {
  if (distanceM == null) {
    return { color: NAV_LINE_COLOR_BRIGHT, opacity: NAV_LINE_OPACITY_BRIGHT }
  }
  const near = NAV_ARRIVAL_RADIUS_M
  const far = NAV_HIGHLIGHT_DISTANCE_BLEND_FAR_M
  const span = far - near
  const t = span <= 0 || distanceM <= near ? 0 : clamp01((distanceM - near) / span)
  const c = new Color(NAV_LINE_COLOR_BRIGHT).lerp(new Color(NAV_LINE_COLOR_HIGHLIGHT_FAR), t)
  const opacity =
    NAV_LINE_OPACITY_BRIGHT + (NAV_LINE_OPACITY_HIGHLIGHT_FAR - NAV_LINE_OPACITY_BRIGHT) * t
  return { color: `#${c.getHexString()}`, opacity }
}

export function NavigationRouteMesh({ route }: { route: NavigationRouteVisual }) {
  const { dimPath, highlightPath, highlightDistanceToGoalM, currentGoal } = route
  const dimPts = toLinePoints(dimPath, NAV_ROUTE_Y)
  const hiPts = toLinePoints(highlightPath, NAV_ROUTE_Y + 0.002)
  const hiStyle = useMemo(
    () => highlightColorOpacity(highlightDistanceToGoalM),
    [highlightDistanceToGoalM],
  )

  return (
    <group userData={{ excludeCameraCollision: true }}>
      {dimPts.length >= 2 && (
        <Line
          points={dimPts}
          color={NAV_LINE_COLOR_DIM}
          lineWidth={NAV_LINE_WIDTH_PX}
          transparent
          opacity={NAV_LINE_OPACITY_DIM}
          depthWrite={false}
          renderOrder={1}
        />
      )}
      {hiPts.length >= 2 && (
        <Line
          points={hiPts}
          color={hiStyle.color}
          lineWidth={NAV_LINE_WIDTH_PX + 1}
          transparent
          opacity={hiStyle.opacity}
          depthWrite={false}
          renderOrder={2}
        />
      )}
      {currentGoal && (
        <mesh
          position={[currentGoal[0], NAV_ROUTE_Y + 0.001, currentGoal[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
        >
          <ringGeometry args={[NAV_ARRIVAL_RING_INNER, NAV_ARRIVAL_RING_OUTER, 48]} />
          <meshBasicMaterial
            color={hiStyle.color}
            transparent
            opacity={Math.min(0.92, hiStyle.opacity * 0.92)}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  )
}
