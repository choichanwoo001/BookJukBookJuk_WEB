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
      <button type="button" data-active={mode === 'topDown'} onClick={() => onModeChange('topDown')}>
        탑뷰
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
