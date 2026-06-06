import type { ViewMode } from '../../types/scene'

export type MapViewButtonsProps = {
  mode: ViewMode
  isEdit: boolean
  missionVersion: number
  missionIndices: number[]
  onModeChange: (next: ViewMode) => void
}

export function MapViewButtons({
  mode,
  isEdit,
  missionVersion,
  missionIndices,
  onModeChange,
}: MapViewButtonsProps) {
  return (
    <div className="mapViewButtons">
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
