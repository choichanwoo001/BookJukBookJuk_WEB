import type { Point2 } from '../../data/floorPlan'
import type { ViewMode } from '../../types/scene'
import type { MinimapUvPoint } from '../scene/MinimapViewportReporter'
import type { MinimapPlayerPos } from '../scene/SceneContent'
import { MinimapSvgOverlay } from './MinimapSvgOverlay'

export type MapMinimapPanelProps = {
  mode: ViewMode
  spanX: number
  spanZ: number
  viewportUv: MinimapUvPoint[] | null
  playerPos: MinimapPlayerPos | null
  navDimPath: Point2[] | null
  navHighlightPath: Point2[] | null
  onClick: () => void
}

export function MapMinimapPanel({
  mode,
  spanX,
  spanZ,
  viewportUv,
  playerPos,
  navDimPath,
  navHighlightPath,
  onClick,
}: MapMinimapPanelProps) {
  return (
    <div className="mapMinimapWrap">
      <button
        type="button"
        className="mapMinimapButton"
        data-active={mode === 'overview'}
        aria-label="전체 보기 토글"
        onClick={onClick}
      >
        <span
          className="mapMinimapStack"
          style={{ aspectRatio: `${spanX} / ${spanZ}` }}
        >
          <img className="mapMinimapImage" src="/map-floor-2d.png" alt="" draggable={false} />
          <MinimapSvgOverlay
            viewportUv={viewportUv}
            playerPos={playerPos}
            navDimPath={navDimPath}
            navHighlightPath={navHighlightPath}
            markerScale={1}
          />
        </span>
      </button>
    </div>
  )
}
