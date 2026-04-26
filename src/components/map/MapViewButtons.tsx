import type { ChangeEvent } from 'react'
import type { ViewMode } from '../../types/scene'

export type MapViewButtonsProps = {
  mode: ViewMode
  isEdit: boolean
  showMapDiffLayer: boolean
  showBookshelfOverlayLayer: boolean
  missionVersion: number
  missionIndices: number[]
  onShowMapDiffChange: (next: boolean) => void
  onShowBookshelfOverlayChange: (next: boolean) => void
  onNewMission: () => void
  onModeChange: (next: ViewMode) => void
}

export function MapViewButtons({
  mode,
  isEdit,
  showMapDiffLayer,
  showBookshelfOverlayLayer,
  missionVersion,
  missionIndices,
  onShowMapDiffChange,
  onShowBookshelfOverlayChange,
  onNewMission,
  onModeChange,
}: MapViewButtonsProps) {
  const handleDiffChange = (e: ChangeEvent<HTMLInputElement>) => onShowMapDiffChange(e.target.checked)
  const handleOverlayChange = (e: ChangeEvent<HTMLInputElement>) => onShowBookshelfOverlayChange(e.target.checked)

  return (
    <div className="mapViewButtons">
      <label className="mapDiffLayerToggle">
        <input type="checkbox" checked={showMapDiffLayer} onChange={handleDiffChange} />
        맵 차이 (ver0↔ver2)
      </label>
      <label className="mapDiffLayerToggle">
        <input type="checkbox" checked={showBookshelfOverlayLayer} onChange={handleOverlayChange} />
        책장 후보 (오버레이)
      </label>
      <button type="button" onClick={onNewMission}>
        새 미션
      </button>
      <button type="button" data-active={mode === 'firstPerson'} onClick={() => onModeChange('firstPerson')}>
        1인칭 시점
      </button>
      <button type="button" data-active={mode === 'thirdPerson'} onClick={() => onModeChange('thirdPerson')}>
        3인칭 시점
      </button>
      <button type="button" data-active={isEdit} onClick={() => onModeChange('edit')}>
        편집 모드
      </button>
      <button type="button" data-active={mode === 'overview'} onClick={() => onModeChange('overview')}>
        전체 보기
      </button>
      <p className="mapMissionStatus" aria-live="polite">
        미션 v{missionVersion}
        {missionIndices.length > 0
          ? ` · 풀 idx ${missionIndices.join(', ')} (메인+오버레이 후보)`
          : ' · 미션용 책장 없음 (floorPlan 검출 책장·오버레이 레이어 모두 없음)'}
      </p>
    </div>
  )
}
