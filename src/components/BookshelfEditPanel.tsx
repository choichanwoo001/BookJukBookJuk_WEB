import { MIN_FIXTURE_PLAN_M, MAX_FIXTURE_PLAN_M } from '../config/constants'
import type { FixtureRenderInstance } from '../types/scene'

function radToDeg(rad: number) {
  return (rad * 180) / Math.PI
}

export function BookshelfEditPanel({
  editTool,
  setEditTool,
  selected,
  selectedIndex,
  setSelectedIndex,
  onAdd,
  onDelete,
  onUpdateW,
  onUpdateD,
  onSnapParallel,
  onSnapPerpendicular,
  onCopy,
  onPaste,
  onCopyChanged,
  onCopyAll,
}: {
  editTool: 'areaSelection' | 'bookshelfEdit'
  setEditTool: (tool: 'areaSelection' | 'bookshelfEdit') => void
  selected: FixtureRenderInstance | null
  selectedIndex: number | null
  setSelectedIndex: (index: number | null) => void
  onAdd: () => void
  onDelete: () => void
  onUpdateW: (v: number) => void
  onUpdateD: (v: number) => void
  onSnapParallel: () => void
  onSnapPerpendicular: () => void
  onCopy: () => void
  onPaste: () => void
  onCopyChanged: () => void
  onCopyAll: () => void
}) {
  return (
    <div className="editPanel">
      <div className="editPanelHeader">책장 편집</div>
      <div className="editToolTabs">
        <button
          type="button"
          data-active={editTool === 'areaSelection'}
          onClick={() => {
            setEditTool('areaSelection')
            setSelectedIndex(null)
          }}
        >
          영역선택
        </button>
        <button
          type="button"
          data-active={editTool === 'bookshelfEdit'}
          onClick={() => setEditTool('bookshelfEdit')}
        >
          책장 편집
        </button>
      </div>
      {selected !== null && selectedIndex !== null ? (
        <div className="editPanelBody">
          <div className="editPanelRow">
            <span className="editLabel">#{selectedIndex}</span>
          </div>
          <div className="editPanelRow">
            <span className="editLabel">X</span>
            <span className="editValue">{selected.cx.toFixed(3)}</span>
          </div>
          <div className="editPanelRow">
            <span className="editLabel">Z</span>
            <span className="editValue">{selected.cz.toFixed(3)}</span>
          </div>
          <div className="editPanelRow">
            <span className="editLabel">Yaw</span>
            <span className="editValue">{radToDeg(selected.yaw).toFixed(1)}°</span>
          </div>
          <div className="editPanelRow">
            <span className="editLabel">가로 (폭, m)</span>
            <input
              type="number"
              className="editPanelInput"
              min={MIN_FIXTURE_PLAN_M}
              max={MAX_FIXTURE_PLAN_M}
              step={0.01}
              value={selected.w}
              onChange={(e) => onUpdateW(Number(e.target.value))}
            />
          </div>
          <div className="editPanelRow">
            <span className="editLabel">세로 (깊이, m)</span>
            <input
              type="number"
              className="editPanelInput"
              min={MIN_FIXTURE_PLAN_M}
              max={MAX_FIXTURE_PLAN_M}
              step={0.01}
              value={selected.d}
              onChange={(e) => onUpdateD(Number(e.target.value))}
            />
          </div>
          <div className="editPanelActions">
            <button type="button" onClick={onSnapParallel}>벽 평행(yaw)</button>
            <button type="button" onClick={onSnapPerpendicular}>벽 직각(yaw)</button>
          </div>
          <div className="editPanelHint">Alt+클릭: 선택 | E: 선택 해제 | 드래그: 이동 | Shift+드래그: 회전 | 휠: 미세 회전 | Ctrl+C / Ctrl+V: 복사·붙여넣기</div>
        </div>
      ) : (
        <div className="editPanelBody">
          <div className="editPanelHint">
            {editTool === 'bookshelfEdit'
              ? 'Alt+클릭으로 책장을 선택하세요 · E로 선택 해제'
              : '영역선택 모드에서 Alt+클릭으로 포인트를 기록하면 구역 안 책장이 선택됩니다'}
          </div>
        </div>
      )}
      {editTool === 'bookshelfEdit' && (
        <>
          <div className="editPanelActions">
            <button type="button" onClick={onAdd}>책장 추가</button>
            <button type="button" onClick={onDelete} disabled={selectedIndex === null}>선택 삭제</button>
          </div>
          <div className="editPanelActions">
            <button type="button" onClick={onCopy} disabled={selectedIndex === null}>
              복사 (Ctrl+C)
            </button>
            <button type="button" onClick={onPaste}>
              붙여넣기 (Ctrl+V)
            </button>
          </div>
          <div className="editPanelActions">
            <button type="button" onClick={onCopyChanged}>변경분 복사</button>
            <button type="button" onClick={onCopyAll}>전체 복사</button>
          </div>
        </>
      )}
    </div>
  )
}
