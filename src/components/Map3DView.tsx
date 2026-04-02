import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { bookshelfInstances, manualBookshelfInstances } from '../data/floorPlan'
import { DEFAULT_BOOKSHELF_SIZE, FIXED_SELECTION_RADIUS_M } from '../config/constants'
import { nearestWallInfo } from '../utils/wallAlignment'
import type { ViewMode, PickPoint, CircleSelection, FixtureRenderInstance } from '../types/scene'
import { findNearestBookshelfInCircle } from '../utils/bookshelfSelection'
import { SceneContent } from './scene/SceneContent'

function formatCoord(value: number) {
  return value.toFixed(3)
}

function selectionToText(selection: CircleSelection) {
  return [
    'circle-area',
    `surface=${selection.center.surface}`,
    `center=(x=${formatCoord(selection.center.x)}, y=${formatCoord(selection.center.y)}, z=${formatCoord(selection.center.z)})`,
    `radius=${formatCoord(FIXED_SELECTION_RADIUS_M)}`,
  ].join(' | ')
}

function buildInitialInstances(): FixtureRenderInstance[] {
  const fromMap = bookshelfInstances.map<FixtureRenderInstance>(item => ({
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: DEFAULT_BOOKSHELF_SIZE.h,
  }))
  const fromManual = manualBookshelfInstances.map<FixtureRenderInstance>(m => ({
    cx: m.cx,
    cz: m.cz,
    w: m.w,
    d: m.d,
    yaw: m.yaw,
    h: m.h,
  }))
  return [...fromMap, ...fromManual]
}

function radToDeg(rad: number) {
  return ((rad * 180) / Math.PI)
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [instances, setInstances] = useState<FixtureRenderInstance[]>(buildInitialInstances)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const initialInstances = useMemo(() => buildInitialInstances(), [])

  const handleAddSelection = useCallback((point: PickPoint) => {
    setSelections((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        center: point,
      },
    ])
    const nearest = findNearestBookshelfInCircle(point.x, point.z, FIXED_SELECTION_RADIUS_M, instances)
    if (nearest !== null) {
      setSelectedIndex(nearest)
      setEditTool('bookshelfEdit')
    }
  }, [instances])

  const handleUpdateInstance = useCallback((index: number, patch: Partial<FixtureRenderInstance>) => {
    setInstances(prev => prev.map((inst, i) => i === index ? { ...inst, ...patch } : inst))
  }, [])

  const handleSelectBookshelf = useCallback((index: number | null) => {
    setSelectedIndex(index)
  }, [])

  useEffect(() => {
    if (selections.length === 0) return
    const text = selections.map(selectionToText).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }, [selections])

  const isEdit = mode === 'edit'
  const selected = selectedIndex !== null ? instances[selectedIndex] : null

  const handleCopyAll = () => {
    const json = JSON.stringify(
      instances.map(({ cx, cz, w, d, yaw, h }) => ({ cx: +cx.toFixed(3), cz: +cz.toFixed(3), w: +w.toFixed(3), d: +d.toFixed(3), yaw: +yaw.toFixed(4), h: +h.toFixed(3) })),
      null,
      2,
    )
    navigator.clipboard.writeText(json).catch(() => {})
  }

  const handleCopyChanged = () => {
    const changed: { index: number; instance: FixtureRenderInstance }[] = []
    for (let i = 0; i < instances.length; i++) {
      const cur = instances[i]
      const orig = initialInstances[i]
      if (
        !orig
        || cur.cx !== orig.cx
        || cur.cz !== orig.cz
        || cur.yaw !== orig.yaw
        || cur.w !== orig.w
        || cur.d !== orig.d
        || cur.h !== orig.h
      ) {
        changed.push({ index: i, instance: cur })
      }
    }
    const json = JSON.stringify(
      changed.map(({ index, instance: { cx, cz, w, d, yaw, h } }) => ({
        index,
        cx: +cx.toFixed(3),
        cz: +cz.toFixed(3),
        w: +w.toFixed(3),
        d: +d.toFixed(3),
        yaw: +yaw.toFixed(4),
        h: +h.toFixed(3),
      })),
      null,
      2,
    )
    navigator.clipboard.writeText(json).catch(() => {})
  }

  const handleAddBookshelf = () => {
    setInstances((prev) => {
      const base = selectedIndex !== null ? prev[selectedIndex] : null
      const created: FixtureRenderInstance = base
        ? {
            ...base,
            cx: base.cx + Math.max(0.8, base.w * 0.75),
            cz: base.cz + Math.max(0.8, base.d * 0.75),
          }
        : {
            cx: 0,
            cz: 0,
            w: DEFAULT_BOOKSHELF_SIZE.w,
            d: DEFAULT_BOOKSHELF_SIZE.d,
            yaw: 0,
            h: DEFAULT_BOOKSHELF_SIZE.h,
          }
      const next = [...prev, created]
      setSelectedIndex(next.length - 1)
      return next
    })
  }

  const handleDeleteBookshelf = () => {
    if (selectedIndex === null) return
    setInstances((prev) => prev.filter((_, i) => i !== selectedIndex))
    setSelectedIndex(null)
  }

  const handleSnapYawToWallParallel = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    const info = nearestWallInfo(inst.cx, inst.cz)
    if (!info) return
    handleUpdateInstance(selectedIndex, { yaw: info.tangentYaw })
  }, [selectedIndex, instances, handleUpdateInstance])

  const handleSnapYawToWallPerpendicular = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    const info = nearestWallInfo(inst.cx, inst.cz)
    if (!info) return
    handleUpdateInstance(selectedIndex, { yaw: info.normalYaw })
  }, [selectedIndex, instances, handleUpdateInstance])

  return (
    <div className="map3DContainer">
      <Canvas dpr={[1, 2]}>
        <SceneContent
          mode={mode}
          editTool={editTool}
          bookshelfRenderInstances={instances}
          selections={selections}
          onAddSelection={handleAddSelection}
          selectedBookshelfIndex={isEdit ? selectedIndex : null}
          onSelectBookshelf={isEdit ? handleSelectBookshelf : undefined}
          onUpdateBookshelf={isEdit ? handleUpdateInstance : undefined}
        />
      </Canvas>

      <div className="mapViewButtons">
        <button type="button" data-active={mode === 'overview'} onClick={() => { setMode('overview'); setSelectedIndex(null) }}>
          전체 보기
        </button>
        <button type="button" data-active={mode === 'thirdPerson'} onClick={() => { setMode('thirdPerson'); setSelectedIndex(null) }}>
          3인칭 시점
        </button>
        <button type="button" data-active={isEdit} onClick={() => { setMode('edit'); setSelectedIndex(null) }}>
          편집 모드
        </button>
      </div>

      {isEdit && (
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
              <div className="editPanelActions">
                <button type="button" onClick={handleSnapYawToWallParallel}>벽 평행(yaw)</button>
                <button type="button" onClick={handleSnapYawToWallPerpendicular}>벽 직각(yaw)</button>
              </div>
              <div className="editPanelHint">클릭: 선택 | 드래그: 이동 | Shift+드래그: 회전 | 휠: 미세 회전</div>
            </div>
          ) : (
            <div className="editPanelBody">
              <div className="editPanelHint">
                {editTool === 'bookshelfEdit' ? '책장을 클릭하여 선택하세요' : '영역선택 모드에서 더블클릭으로 포인트를 기록하면 구역 안 책장이 선택됩니다'}
              </div>
            </div>
          )}
          {editTool === 'bookshelfEdit' && (
            <>
              <div className="editPanelActions">
                <button type="button" onClick={handleAddBookshelf}>책장 추가</button>
                <button type="button" onClick={handleDeleteBookshelf} disabled={selectedIndex === null}>선택 삭제</button>
              </div>
              <div className="editPanelActions">
                <button type="button" onClick={handleCopyChanged}>변경분 복사</button>
                <button type="button" onClick={handleCopyAll}>전체 복사</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Map3DView
