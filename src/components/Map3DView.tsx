import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { counterInstances, displayLowInstances } from '../data/floorPlan'
import {
  FIXED_SELECTION_RADIUS_M,
  WALK_DEFAULT_FOV,
  WALK_FOV_BUTTON_STEP,
  ZOOM_FOV_MAX,
  ZOOM_FOV_MIN,
} from '../config/constants'
import { useBookshelfInstances } from '../hooks/useBookshelfInstances'
import { useBookshelfClipboard } from '../hooks/useBookshelfClipboard'
import type { ViewMode, CircleSelection, PickPoint, FixtureRenderInstance } from '../types/scene'
import type { MinimapUvPoint } from './scene/MinimapViewportReporter'
import { getMinimapWorldBounds } from '../utils/minimapBounds'
import { SceneContent } from './scene/SceneContent'
import { BookshelfEditPanel } from './BookshelfEditPanel'

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

function selectionToText(selection: CircleSelection) {
  const { center } = selection
  return [
    'circle-area',
    `surface=${center.surface}`,
    `center=(x=${center.x.toFixed(3)}, y=${center.y.toFixed(3)}, z=${center.z.toFixed(3)})`,
    `radius=${FIXED_SELECTION_RADIUS_M.toFixed(3)}`,
  ].join(' | ')
}

function isEditableDomTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [showMapDiffLayer, setShowMapDiffLayer] = useState(false)
  const [showBookshelfOverlayLayer, setShowBookshelfOverlayLayer] = useState(false)
  const [walkFov, setWalkFov] = useState(WALK_DEFAULT_FOV)
  const [thirdPersonOcclusionFade, setThirdPersonOcclusionFade] = useState(false)
  const [thirdPersonFovAdjustEnabled, setThirdPersonFovAdjustEnabled] = useState(false)
  const [minimapViewportUv, setMinimapViewportUv] = useState<MinimapUvPoint[] | null>(null)
  const staticInstances = useMemo(() => buildStaticInstances(), [])
  const { spanX: minimapSpanX, spanZ: minimapSpanZ } = useMemo(() => getMinimapWorldBounds(), [])
  const forwardArrowRef = useRef<HTMLDivElement>(null)

  const handleMinimapViewportUv = useCallback((quad: MinimapUvPoint[] | null) => {
    setMinimapViewportUv(quad)
  }, [])

  const {
    instances,
    selectedIndex,
    setSelectedIndex,
    initialInstances,
    handleUpdateInstance,
    addInstance,
    handleAddBookshelf,
    handleDeleteBookshelf,
    handleAddSelection,
    handleSnapYawToWallParallel,
    handleSnapYawToWallPerpendicular,
    handleUpdateW,
    handleUpdateD,
  } = useBookshelfInstances()

  const isEdit = mode === 'edit'
  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'

  const clampWalkFov = useCallback((v: number) => Math.min(ZOOM_FOV_MAX, Math.max(ZOOM_FOV_MIN, v)), [])

  const handleWalkFovChange = useCallback((next: number) => {
    setWalkFov(clampWalkFov(next))
  }, [clampWalkFov])

  const handleAddSelectionWithCircle = useCallback((point: PickPoint) => {
    setSelections((prev) => [
      ...prev,
      { id: crypto.randomUUID(), center: point },
    ])
    const nearest = handleAddSelection(point)
    if (nearest !== null) setEditTool('bookshelfEdit')
  }, [handleAddSelection])

  const { copySelectedToClipboard, handlePaste, handleCopyAll, handleCopyChanged } = useBookshelfClipboard({
    instances,
    selectedIndex,
    initialInstances,
    isEnabled: isBookshelfEdit,
    onPasteNew: addInstance,
  })

  useEffect(() => {
    if (selections.length === 0) return
    const text = selections.map(selectionToText).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }, [selections])

  useEffect(() => {
    if (mode !== 'edit' || editTool !== 'bookshelfEdit') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableDomTarget(e.target)) return
      e.preventDefault()
      setSelectedIndex(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, editTool, setSelectedIndex])

  const selected = selectedIndex !== null ? instances[selectedIndex] : null

  return (
    <div className="map3DContainer">
      <Canvas dpr={[1, 2]} style={{ zIndex: 0 }}>
        <SceneContent
          mode={mode}
          editTool={editTool}
          bookshelfRenderInstances={instances}
          staticFixtureInstances={staticInstances}
          selections={selections}
          onAddSelection={handleAddSelectionWithCircle}
          selectedBookshelfIndex={isEdit ? selectedIndex : null}
          onSelectBookshelf={isEdit ? setSelectedIndex : undefined}
          onUpdateBookshelf={isEdit ? handleUpdateInstance : undefined}
          showMapDiffLayer={showMapDiffLayer}
          showBookshelfOverlayLayer={showBookshelfOverlayLayer}
          forwardArrowRef={forwardArrowRef}
          walkFov={walkFov}
          onWalkFovChange={handleWalkFovChange}
          thirdPersonOcclusionFade={thirdPersonOcclusionFade}
          thirdPersonFovAdjustEnabled={thirdPersonFovAdjustEnabled}
          onMinimapViewportUv={handleMinimapViewportUv}
        />
      </Canvas>

      {(mode === 'firstPerson' || mode === 'thirdPerson') && (
        <div style={{
          position: 'absolute',
          bottom: '36px',
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <div ref={forwardArrowRef} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="14,2 22,18 14,14 6,18" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      {mode === 'thirdPerson' && (
        <div
          className="map3DThirdPersonHud"
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            userSelect: 'none',
            zIndex: 11,
          }}
        >
          <button
            type="button"
            className="map3DThirdPersonHudButton"
            data-active={thirdPersonOcclusionFade}
            aria-pressed={thirdPersonOcclusionFade}
            aria-label="가림 반투명"
            onClick={() => setThirdPersonOcclusionFade((v) => !v)}
          >
            반투명
          </button>
          <button
            type="button"
            className="map3DThirdPersonHudButton"
            data-active={thirdPersonFovAdjustEnabled}
            aria-pressed={thirdPersonFovAdjustEnabled}
            aria-label="시야 줌(FOV 조절)"
            onClick={() => setThirdPersonFovAdjustEnabled((v) => !v)}
          >
            시야 줌
          </button>
          {thirdPersonFovAdjustEnabled && (
            <>
              <button
                type="button"
                className="map3DThirdPersonHudButton"
                aria-label="시야 넓히기"
                onClick={() => setWalkFov((f) => clampWalkFov(f + WALK_FOV_BUTTON_STEP))}
              >
                −
              </button>
              <button
                type="button"
                className="map3DThirdPersonHudButton"
                aria-label="시야 좁히기"
                onClick={() => setWalkFov((f) => clampWalkFov(f - WALK_FOV_BUTTON_STEP))}
              >
                +
              </button>
            </>
          )}
        </div>
      )}

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
        <button type="button" data-active={mode === 'firstPerson'} onClick={() => { setMode('firstPerson'); setSelectedIndex(null) }}>
          1인칭 시점
        </button>
        <button type="button" data-active={mode === 'thirdPerson'} onClick={() => { setMode('thirdPerson'); setSelectedIndex(null) }}>
          3인칭 시점
        </button>
        <button type="button" data-active={isEdit} onClick={() => { setMode('edit'); setSelectedIndex(null) }}>
          편집 모드
        </button>
      </div>

      <div className="mapMinimapWrap">
        <button
          type="button"
          className="mapMinimapButton"
          data-active={mode === 'overview'}
          aria-label="전체 보기"
          onClick={() => { setMode('overview'); setSelectedIndex(null) }}
        >
          <span
            className="mapMinimapStack"
            style={{ aspectRatio: `${minimapSpanX} / ${minimapSpanZ}` }}
          >
            <img className="mapMinimapImage" src="/map-floor-2d.png" alt="" draggable={false} />
            {minimapViewportUv && minimapViewportUv.length === 4 && (
              <svg
                className="mapMinimapOverlay"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                aria-hidden
              >
                <polygon
                  fill="rgba(127, 166, 255, 0.2)"
                  stroke="rgba(200, 214, 255, 0.95)"
                  strokeWidth="0.005"
                  points={minimapViewportUv.map((p) => `${p.u},${p.v}`).join(' ')}
                />
              </svg>
            )}
          </span>
        </button>
      </div>

      {isEdit && (
        <BookshelfEditPanel
          editTool={editTool}
          setEditTool={setEditTool}
          selected={selected}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onAdd={handleAddBookshelf}
          onDelete={handleDeleteBookshelf}
          onUpdateW={handleUpdateW}
          onUpdateD={handleUpdateD}
          onSnapParallel={handleSnapYawToWallParallel}
          onSnapPerpendicular={handleSnapYawToWallPerpendicular}
          onCopy={copySelectedToClipboard}
          onPaste={() => void handlePaste()}
          onCopyChanged={handleCopyChanged}
          onCopyAll={handleCopyAll}
        />
      )}
    </div>
  )
}

export default Map3DView
