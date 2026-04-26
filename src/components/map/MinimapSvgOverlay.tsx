import type { Point2 } from '../../data/floorPlan'
import { MAP_VIEW_YAW_OFFSET_RAD } from '../../config/constants'
import type { MinimapUvPoint } from '../scene/MinimapViewportReporter'
import type { MinimapPlayerPos } from '../scene/SceneContent'
import { worldXzToMinimapUv } from '../../utils/minimapBounds'

function pathToMinimapPolyline(points: Point2[]): string {
  if (points.length < 2) return ''
  return points
    .map(([x, z]) => {
      const { u, v } = worldXzToMinimapUv(x, z)
      return `${u},${v}`
    })
    .join(' ')
}

export type MinimapSvgOverlayProps = {
  viewportUv: MinimapUvPoint[] | null
  playerPos: MinimapPlayerPos | null
  navDimPath?: Point2[] | null
  navHighlightPath?: Point2[] | null
  markerScale?: number
}

export function MinimapSvgOverlay({
  viewportUv,
  playerPos,
  navDimPath,
  navHighlightPath,
  markerScale = 1,
}: MinimapSvgOverlayProps) {
  const hasViewport = viewportUv && viewportUv.length === 4
  const hasNav = (navDimPath && navDimPath.length >= 2) || (navHighlightPath && navHighlightPath.length >= 2)
  if (!hasViewport && !playerPos && !hasNav) return null

  const arrowAngleDeg = playerPos
    ? (MAP_VIEW_YAW_OFFSET_RAD - playerPos.yaw) * (180 / Math.PI)
    : 0

  return (
    <svg
      className="mapMinimapOverlay"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {hasNav && navDimPath && navDimPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(100, 170, 230, 0.4)"
          strokeWidth="0.007"
          strokeLinejoin="round"
          points={pathToMinimapPolyline(navDimPath)}
        />
      )}
      {hasNav && navHighlightPath && navHighlightPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(120, 240, 255, 0.95)"
          strokeWidth="0.009"
          strokeLinejoin="round"
          points={pathToMinimapPolyline(navHighlightPath)}
        />
      )}
      {hasViewport && (
        <polygon
          fill="none"
          stroke="rgba(160, 200, 255, 0.95)"
          strokeWidth="0.0065"
          strokeLinejoin="round"
          points={viewportUv.map((p) => `${p.u},${p.v}`).join(' ')}
        />
      )}
      {playerPos && (
        <g transform={`translate(${playerPos.u},${playerPos.v})`}>
          <circle
            r={0.012 * markerScale}
            fill="rgba(255,220,50,0.9)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={0.004 * markerScale}
          />
          <polygon
            points={`0,${-0.022 * markerScale} ${0.009 * markerScale},${0.008 * markerScale} ${-0.009 * markerScale},${0.008 * markerScale}`}
            fill="rgba(255,220,50,0.95)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={0.003 * markerScale}
            transform={`rotate(${arrowAngleDeg})`}
          />
        </g>
      )}
    </svg>
  )
}
