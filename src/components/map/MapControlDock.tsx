import type { ViewMode } from '../../types/scene'
import type { VersoConnectionState } from '../../lib/verso/types'
import { MapViewButtons } from './MapViewButtons'
import { VersoConnectionPanel } from './VersoConnectionPanel'

export type MapControlDockProps = {
  visible: boolean
  onToggleVisible: () => void
  usersId: string | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onResetOnboarding: () => void
  mode: ViewMode
  isEdit: boolean
  onModeChange: (next: ViewMode) => void
  versoConnectionState: VersoConnectionState
  onVersoConnect: (url: string) => void
  onVersoDisconnect: () => void
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
  versoConnectionState,
  onVersoConnect,
  onVersoDisconnect,
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
          <button type="button" onClick={onResetOnboarding}>
            처음으로
          </button>
        </div>
        <MapViewButtons
          mode={mode}
          isEdit={isEdit}
          onModeChange={onModeChange}
        />
        <VersoConnectionPanel
          connectionState={versoConnectionState}
          onConnect={onVersoConnect}
          onDisconnect={onVersoDisconnect}
        />
      </div>
    </div>
  )
}
