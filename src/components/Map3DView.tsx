import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { bookshelfInstances, counterInstances, displayLowInstances } from '../data/floorPlan'
import {
  DEFAULT_BOOKSHELF_SIZE,
  FIXED_SELECTION_RADIUS_M,
  MAX_FIXTURE_PLAN_M,
  MIN_FIXTURE_PLAN_M,
} from '../config/constants'
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
  return bookshelfInstances.map<FixtureRenderInstance>(item => ({
    kind: 'bookshelf',
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: DEFAULT_BOOKSHELF_SIZE.h,
  }))
}

function buildStaticInstances(): FixtureRenderInstance[] {
  const counters = counterInstances.map<FixtureRenderInstance>((item) => ({
    kind: 'counter',
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: item.h,
  }))
  const displays = displayLowInstances.map<FixtureRenderInstance>((item) => ({
    kind: 'displayLow',
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: item.h,
  }))
  return [...counters, ...displays]
}

function radToDeg(rad: number) {
  return ((rad * 180) / Math.PI)
}

function clampFixturePlanDimension(value: number): number {
  return Math.min(MAX_FIXTURE_PLAN_M, Math.max(MIN_FIXTURE_PLAN_M, value))
}

function isEditableDomTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** Offset copy so the duplicate does not sit on top of the source (same as "책장 추가"). */
function offsetDuplicateBookshelf(source: FixtureRenderInstance): FixtureRenderInstance {
  return {
    ...source,
    kind: 'bookshelf',
    cx: source.cx + Math.max(0.8, source.w * 0.75),
    cz: source.cz + Math.max(0.8, source.d * 0.75),
  }
}

/** Parse a single bookshelf from clipboard JSON (object, or array from "전체 복사"). */
function parseBookshelfFromClipboardText(text: string): FixtureRenderInstance | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.trim())
  } catch {
    return null
  }
  if (Array.isArray(parsed) && parsed.length > 0) {
    parsed = parsed[0]
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const cx = typeof o.cx === 'number' ? o.cx : Number(o.cx)
  const cz = typeof o.cz === 'number' ? o.cz : Number(o.cz)
  const w = typeof o.w === 'number' ? o.w : Number(o.w)
  const d = typeof o.d === 'number' ? o.d : Number(o.d)
  const yaw = typeof o.yaw === 'number' ? o.yaw : Number(o.yaw)
  const h = typeof o.h === 'number' ? o.h : Number(o.h)
  if (![cx, cz, w, d, yaw, h].every(Number.isFinite)) return null
  return {
    kind: 'bookshelf',
    cx,
    cz,
    w: clampFixturePlanDimension(w),
    d: clampFixturePlanDimension(d),
    yaw,
    h: clampFixturePlanDimension(h),
  }
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [instances, setInstances] = useState<FixtureRenderInstance[]>(buildInitialInstances)
  const staticInstances = useMemo(() => buildStaticInstances(), [])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [showMapDiffLayer, setShowMapDiffLayer] = useState(false)
  const [showBookshelfOverlayLayer, setShowBookshelfOverlayLayer] = useState(false)
  const initialInstances = useMemo(() => buildInitialInstances(), [])
  const copiedBookshelfRef = useRef<FixtureRenderInstance | null>(null)

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'edit' || editTool !== 'bookshelfEdit') return
      if (e.code !== 'KeyE') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableDomTarget(e.target)) return
      e.preventDefault()
      setSelectedIndex(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, editTool])

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
        ? offsetDuplicateBookshelf(base)
        : {
            kind: 'bookshelf',
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

  const copySelectedBookshelfToClipboard = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    if (!inst) return
    const snapshot: FixtureRenderInstance = { ...inst, kind: 'bookshelf' }
    copiedBookshelfRef.current = snapshot
    navigator.clipboard.writeText(JSON.stringify(snapshot)).catch(() => {})
  }, [selectedIndex, instances])

  const pasteBookshelfAsNew = useCallback((template: FixtureRenderInstance) => {
    const created = offsetDuplicateBookshelf(template)
    setInstances((prev) => {
      const next = [...prev, created]
      setSelectedIndex(next.length - 1)
      return next
    })
  }, [])

  const handlePasteBookshelf = useCallback(async () => {
    let template: FixtureRenderInstance | null = null
    try {
      const text = await navigator.clipboard.readText()
      template = parseBookshelfFromClipboardText(text)
    } catch {
      /* clipboard API unavailable or denied */
    }
    if (!template) template = copiedBookshelfRef.current
    if (!template) return
    pasteBookshelfAsNew(template)
  }, [pasteBookshelfAsNew])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'edit' || editTool !== 'bookshelfEdit') return
      if (!e.ctrlKey && !e.metaKey) return
      if (isEditableDomTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        if (selectedIndex === null) return
        e.preventDefault()
        copySelectedBookshelfToClipboard()
        return
      }
      if (k === 'v') {
        e.preventDefault()
        void handlePasteBookshelf()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, editTool, selectedIndex, copySelectedBookshelfToClipboard, handlePasteBookshelf])

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
          staticFixtureInstances={staticInstances}
          selections={selections}
          onAddSelection={handleAddSelection}
          selectedBookshelfIndex={isEdit ? selectedIndex : null}
          onSelectBookshelf={isEdit ? handleSelectBookshelf : undefined}
          onUpdateBookshelf={isEdit ? handleUpdateInstance : undefined}
          showMapDiffLayer={showMapDiffLayer}
          showBookshelfOverlayLayer={showBookshelfOverlayLayer}
        />
      </Canvas>

      <div className="mapViewButtons">
        <label className="mapDiffLayerToggle">
          <input
            type="checkbox"
            checked={showMapDiffLayer}
            onChange={(e) => setShowMapDiffLayer(e.target.checked)}
          />
          맵 차이 (ver0↔ver2)
        </label>
        <label className="mapDiffLayerToggle">
          <input
            type="checkbox"
            checked={showBookshelfOverlayLayer}
            onChange={(e) => setShowBookshelfOverlayLayer(e.target.checked)}
          />
          책장 후보 (오버레이)
        </label>
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
              <div className="editPanelRow">
                <span className="editLabel">가로 (폭, m)</span>
                <input
                  type="number"
                  className="editPanelInput"
                  min={MIN_FIXTURE_PLAN_M}
                  max={MAX_FIXTURE_PLAN_M}
                  step={0.01}
                  value={selected.w}
                  onChange={(e) => {
                    if (selectedIndex === null) return
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v)) return
                    handleUpdateInstance(selectedIndex, { w: clampFixturePlanDimension(v) })
                  }}
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
                  onChange={(e) => {
                    if (selectedIndex === null) return
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v)) return
                    handleUpdateInstance(selectedIndex, { d: clampFixturePlanDimension(v) })
                  }}
                />
              </div>
              <div className="editPanelActions">
                <button type="button" onClick={handleSnapYawToWallParallel}>벽 평행(yaw)</button>
                <button type="button" onClick={handleSnapYawToWallPerpendicular}>벽 직각(yaw)</button>
              </div>
              <div className="editPanelHint">Alt+클릭: 선택 | E: 선택 해제 | 드래그: 이동 | Shift+드래그: 회전 | 휠: 미세 회전 | Ctrl+C / Ctrl+V: 복사·붙여넣기</div>
            </div>
          ) : (
            <div className="editPanelBody">
              <div className="editPanelHint">
                {editTool === 'bookshelfEdit' ? 'Alt+클릭으로 책장을 선택하세요 · E로 선택 해제' : '영역선택 모드에서 Alt+클릭으로 포인트를 기록하면 구역 안 책장이 선택됩니다'}
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
                <button
                  type="button"
                  onClick={copySelectedBookshelfToClipboard}
                  disabled={selectedIndex === null}
                >
                  복사 (Ctrl+C)
                </button>
                <button type="button" onClick={() => void handlePasteBookshelf()}>
                  붙여넣기 (Ctrl+V)
                </button>
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
