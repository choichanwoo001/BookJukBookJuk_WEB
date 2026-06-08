import type { ViewMode } from '../../types/scene'

export type MapViewButtonsProps = {
  mode: ViewMode
  isEdit: boolean
  onModeChange: (next: ViewMode) => void
}

export function MapViewButtons({
  mode,
  isEdit,
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
    </div>
  )
}
