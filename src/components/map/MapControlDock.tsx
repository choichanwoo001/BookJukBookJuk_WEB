import type { ViewMode } from '../../types/scene'
import type { RoutePathDisplayMode } from '../../utils/pathSmoothing'
import { MapViewButtons } from './MapViewButtons'

export type MapControlDockProps = {
  visible: boolean
  onToggleVisible: () => void
  usersId: string | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onResetOnboarding?: () => void
  mode: ViewMode
  isEdit: boolean
  onModeChange: (next: ViewMode) => void
  routePathDisplayMode: RoutePathDisplayMode
  onRoutePathDisplayModeChange: (next: RoutePathDisplayMode) => void
}

export function MapControlDock({
  visible,
  onToggleVisible,
  usersId,
  isFullscreen,
  onToggleFullscreen,
  onResetOnboarding,
  mode,
  isEdit,
  onModeChange,
  routePathDisplayMode,
  onRoutePathDisplayModeChange,
}: MapControlDockProps) {
  return (
    <div className="mapControlDockArea">
      <button
        type="button"
        className="mapControlDockToggle"
        onClick={onToggleVisible}
        aria-expanded={visible}
        aria-label={visible ? '맵 컨트롤 숨기기' : '맵 컨트롤 보이기'}
      >
        {visible ? '컨트롤 숨기기' : '컨트롤 보이기'}
      </button>
      <div className={`mapControlDock${visible ? '' : ' mapControlDock--hidden'}`}>
        <div className="sessionBadge">
          <span>{usersId ? `사용자 ${usersId}` : '첫 방문 게스트'}</span>
          <button type="button" onClick={onToggleFullscreen}>
            {isFullscreen ? '전체화면 종료' : '전체화면'}
          </button>
          {onResetOnboarding && (
            <button type="button" onClick={onResetOnboarding}>
              처음으로
            </button>
          )}
        </div>
        <MapViewButtons
          mode={mode}
          isEdit={isEdit}
          onModeChange={onModeChange}
        />
        <div className="mapRoutePathButtons" aria-label="경로 표시 방식">
          <button
            type="button"
            data-active={routePathDisplayMode === 'curved'}
            onClick={() => onRoutePathDisplayModeChange('curved')}
          >
            곡선
          </button>
          <button
            type="button"
            data-active={routePathDisplayMode === 'straight'}
            onClick={() => onRoutePathDisplayModeChange('straight')}
          >
            직선
          </button>
        </div>
      </div>
    </div>
  )
}
