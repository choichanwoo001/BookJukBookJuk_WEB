import type { Point2 } from '../../data/floorPlan'
import { MAP_VIEW_YAW_OFFSET_RAD } from '../../config/constants'
import type { MinimapUvPoint } from '../scene/MinimapViewportReporter'
import type { MinimapPlayerPos } from '../scene/SceneContent'
import { worldXzToMinimapUv } from '../../utils/minimapBounds'
import { getPathForDisplay, type RoutePathDisplayMode } from '../../utils/pathSmoothing'
import type { WalkabilityContext } from '../../utils/walkability'

function pathToMinimapPolyline(
  points: Point2[],
  pathDisplayMode: RoutePathDisplayMode,
  walkabilityCtx?: WalkabilityContext,
): string {
  if (points.length < 2) return ''
  const displayPath = getPathForDisplay(
    points,
    pathDisplayMode,
    walkabilityCtx ? { ctx: walkabilityCtx } : undefined,
  )
  return displayPath
    .map(([x, z]) => {
      const { u, v } = worldXzToMinimapUv(x, z)
      return `${u},${v}`
    })
    .join(' ')
}

export type MinimapNavSegmentPath = {
  path: Point2[]
  connected?: boolean
}

export type MinimapSvgOverlayProps = {
  viewportUv: MinimapUvPoint[] | null
  playerPos: MinimapPlayerPos | null
  navDimPath?: Point2[] | null
  navHighlightPath?: Point2[] | null
  navSegmentPaths?: MinimapNavSegmentPath[] | null
  walkabilityCtx?: WalkabilityContext
  pathDisplayMode?: RoutePathDisplayMode
  markerScale?: number
}

export function MinimapSvgOverlay({
  viewportUv,
  playerPos,
  navDimPath,
  navHighlightPath,
  navSegmentPaths,
  walkabilityCtx,
  pathDisplayMode = 'curved',
  markerScale = 1,
}: MinimapSvgOverlayProps) {
  const hasViewport = viewportUv && viewportUv.length === 4
  const hasSegmentNav = navSegmentPaths && navSegmentPaths.length > 0
  const hasNav =
    hasSegmentNav ||
    (navDimPath && navDimPath.length >= 2) ||
    (navHighlightPath && navHighlightPath.length >= 2)
  if (!hasViewport && !playerPos && !hasNav) return null

  // Three.js yaw=0은 -Z(미니맵 아래)를 향함. SVG 화살표 기본은 -v(미니맵 위=+Z)이므로 π 보정.
  const arrowAngleDeg = playerPos
    ? (MAP_VIEW_YAW_OFFSET_RAD + Math.PI - playerPos.yaw) * (180 / Math.PI)
    : 0

  return (
    <svg
      className="mapMinimapOverlay"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {hasSegmentNav &&
        navSegmentPaths!.map((seg, index) => {
          const polyline = pathToMinimapPolyline(seg.path, pathDisplayMode, walkabilityCtx)
          if (!polyline) return null
          const connected = seg.connected !== false
          return (
            <g key={`seg-${index}`}>
              <polyline
                fill="none"
                stroke="rgba(100, 170, 230, 0.4)"
                strokeWidth="0.007"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={connected ? 1 : 0.55}
                points={polyline}
              />
              <polyline
                fill="none"
                stroke="rgba(120, 240, 255, 0.95)"
                strokeWidth="0.009"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={connected ? 1 : 0.5}
                points={polyline}
              />
            </g>
          )
        })}
      {!hasSegmentNav && hasNav && navDimPath && navDimPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(100, 170, 230, 0.4)"
          strokeWidth="0.007"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pathToMinimapPolyline(navDimPath, pathDisplayMode, walkabilityCtx)}
        />
      )}
      {!hasSegmentNav && hasNav && navHighlightPath && navHighlightPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(120, 240, 255, 0.95)"
          strokeWidth="0.009"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pathToMinimapPolyline(navHighlightPath, pathDisplayMode, walkabilityCtx)}
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
