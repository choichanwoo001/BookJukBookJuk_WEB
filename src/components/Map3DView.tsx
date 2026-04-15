import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  counterInstances,
  displayLowInstances,
  floorRects,
  pillarRects,
  PLAYER_RADIUS_M,
  wallRects as baseWallRects,
} from '../data/floorPlan'
import type { Point2 } from '../data/floorPlan'
import { axisAlignedBoundsForRotatedBookshelf } from '../utils/bookshelfCollision'
import { pickMissionIndicesSeeded } from '../utils/missionPick'
import { useNavigationRoute } from '../hooks/useNavigationRoute'
import {
  FIXED_SELECTION_RADIUS_M,
  MAP_VIEW_YAW_OFFSET_RAD,
  THIRD_PERSON_DEFAULT_FOV,
  WALK_DEFAULT_FOV,
  ZOOM_FOV_MAX,
  ZOOM_FOV_MIN,
} from '../config/constants'
import { useBookshelfInstances } from '../hooks/useBookshelfInstances'
import { useBookshelfClipboard } from '../hooks/useBookshelfClipboard'
import type { ViewMode, CircleSelection, PickPoint, FixtureRenderInstance } from '../types/scene'
import type { MinimapUvPoint } from './scene/MinimapViewportReporter'
import type { MinimapPlayerPos } from './scene/SceneContent'
import { getMinimapWorldBounds, worldXzToMinimapUv } from '../utils/minimapBounds'
import { SceneContent } from './scene/SceneContent'
import { BookshelfEditPanel } from './BookshelfEditPanel'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'

/** 메인 씬과 오버레이 후보에 같은 위치가 있으면 한 번만 미션·충돌에 넣음 */
const MISSION_SHELF_DEDUPE_M = 0.08

function mergeMissionBookshelfPool(instances: FixtureRenderInstance[]): FixtureRenderInstance[] {
  const main = instances.filter((b): b is Extract<FixtureRenderInstance, { kind: 'bookshelf' }> => b.kind === 'bookshelf')
  const out: FixtureRenderInstance[] = [...main]
  for (const o of bookshelfOverlayLayerInstances) {
    if (o.kind !== 'bookshelf') continue
    const dup = out.some((m) => Math.hypot(m.cx - o.cx, m.cz - o.cz) < MISSION_SHELF_DEDUPE_M)
    if (!dup) out.push(o)
  }
  return out
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

function pathToMinimapPolyline(points: Point2[]): string {
  if (points.length < 2) return ''
  return points
    .map(([x, z]) => {
      const { u, v } = worldXzToMinimapUv(x, z)
      return `${u},${v}`
    })
    .join(' ')
}

function MinimapSvgOverlay({
  viewportUv,
  playerPos,
  navDimPath,
  navHighlightPath,
  markerScale = 1,
}: {
  viewportUv: MinimapUvPoint[] | null
  playerPos: MinimapPlayerPos | null
  navDimPath?: Point2[] | null
  navHighlightPath?: Point2[] | null
  markerScale?: number
}) {
  const hasViewport = viewportUv && viewportUv.length === 4
  const hasNav = (navDimPath && navDimPath.length >= 2) || (navHighlightPath && navHighlightPath.length >= 2)
  if (!hasViewport && !playerPos && !hasNav) return null

  const arrowAngleDeg = playerPos
    ? (MAP_VIEW_YAW_OFFSET_RAD - playerPos.yaw) * (180 / Math.PI)
    : 0

  return (
    <svg
      className="mapMinimapOverlay"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {hasNav && navDimPath && navDimPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(100, 170, 230, 0.4)"
          strokeWidth="0.007"
          strokeLinejoin="round"
          points={pathToMinimapPolyline(navDimPath)}
        />
      )}
      {hasNav && navHighlightPath && navHighlightPath.length >= 2 && (
        <polyline
          fill="none"
          stroke="rgba(120, 240, 255, 0.95)"
          strokeWidth="0.009"
          strokeLinejoin="round"
          points={pathToMinimapPolyline(navHighlightPath)}
        />
      )}
      {hasViewport && (
        <polygon
          fill="none"
          stroke="rgba(160, 200, 255, 0.95)"
          strokeWidth="0.0065"
          strokeLinejoin="round"
          points={viewportUv.map((p) => `${p.u},${p.v}`).join(' ')}
        />
      )}
      {playerPos && (
        <g transform={`translate(${playerPos.u},${playerPos.v})`}>
          <circle
            r={0.012 * markerScale}
            fill="rgba(255,220,50,0.9)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={0.004 * markerScale}
          />
          <polygon
            points={`0,${-0.022 * markerScale} ${0.009 * markerScale},${0.008 * markerScale} ${-0.009 * markerScale},${0.008 * markerScale}`}
            fill="rgba(255,220,50,0.95)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={0.003 * markerScale}
            transform={`rotate(${arrowAngleDeg})`}
          />
        </g>
      )}
    </svg>
  )
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [showMapDiffLayer, setShowMapDiffLayer] = useState(false)
  const [showBookshelfOverlayLayer, setShowBookshelfOverlayLayer] = useState(false)
  const [firstPersonFov, setFirstPersonFov] = useState(WALK_DEFAULT_FOV)
  const [thirdPersonFov, setThirdPersonFov] = useState(THIRD_PERSON_DEFAULT_FOV)
  const [minimapViewportUv, setMinimapViewportUv] = useState<MinimapUvPoint[] | null>(null)
  const [minimapPlayerPos, setMinimapPlayerPos] = useState<{ u: number; v: number; yaw: number } | null>(null)
  const playerWorldXzRef = useRef<Point2 | null>(null)
  const [missionVersion, setMissionVersion] = useState(0)
  const [prevWalkMode, setPrevWalkMode] = useState<'firstPerson' | 'thirdPerson'>('firstPerson')
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

  const missionBookshelfPool = useMemo(() => mergeMissionBookshelfPool(instances), [instances])

  const missionIndices = useMemo(() => {
    const pool = missionBookshelfPool.map((_, i) => i)
    return pickMissionIndicesSeeded(pool, missionVersion)
  }, [missionBookshelfPool, missionVersion])

  const handleNewMission = useCallback(() => {
    setMissionVersion((v) => v + 1)
  }, [])

  const navBounds = useMemo(() => {
    const b = getMinimapWorldBounds()
    return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }
  }, [])
  const navBookshelfRects = useMemo(() => {
    const mainRects = instances.map((inst) =>
      axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw),
    )
    const extra: ReturnType<typeof axisAlignedBoundsForRotatedBookshelf>[] = []
    for (const o of bookshelfOverlayLayerInstances) {
      const dup = instances.some(
        (m) => Math.hypot(m.cx - o.cx, m.cz - o.cz) < MISSION_SHELF_DEDUPE_M,
      )
      if (!dup) {
        extra.push(axisAlignedBoundsForRotatedBookshelf(o.cx, o.cz, o.w, o.d, o.yaw))
      }
    }
    return [...mainRects, ...extra]
  }, [instances])
  const navCtx = useMemo(
    () => ({
      floorRects,
      wallRects: baseWallRects,
      bookshelfRects: navBookshelfRects,
      pillarRects,
      playerRadiusM: PLAYER_RADIUS_M,
    }),
    [navBookshelfRects],
  )
  const navigationRoute = useNavigationRoute({
    missionIndices,
    missionVersion,
    bookshelfInstances: missionBookshelfPool,
    playerXzRef: playerWorldXzRef,
    ctx: navCtx,
    bounds: navBounds,
  })

  const isEdit = mode === 'edit'
  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'

  const clampWalkFov = useCallback((v: number) => Math.min(ZOOM_FOV_MAX, Math.max(ZOOM_FOV_MIN, v)), [])

  const handleWalkFovChange = useCallback(
    (next: number) => {
      const v = clampWalkFov(next)
      if (mode === 'thirdPerson') setThirdPersonFov(v)
      else setFirstPersonFov(v)
    },
    [clampWalkFov, mode],
  )

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
          walkFov={mode === 'thirdPerson' ? thirdPersonFov : firstPersonFov}
          onWalkFovChange={handleWalkFovChange}
          onMinimapViewportUv={handleMinimapViewportUv}
          onPlayerPosition={setMinimapPlayerPos}
          playerWorldXzRef={playerWorldXzRef}
          navigationRoute={navigationRoute}
        />
      </Canvas>

      <div className="map3DUiLayer">
      {(mode === 'firstPerson' || mode === 'thirdPerson') && (
        <div className="map3DForwardHud">
          <div ref={forwardArrowRef} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="14,2 22,18 14,14 6,18" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </div>
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
        <button type="button" onClick={handleNewMission}>
          새 미션
        </button>
        <button type="button" data-active={mode === 'firstPerson'} onClick={() => { setMode('firstPerson'); setSelectedIndex(null) }}>
          1인칭 시점
        </button>
        <button type="button" data-active={mode === 'thirdPerson'} onClick={() => { setMode('thirdPerson'); setSelectedIndex(null) }}>
          3인칭 시점
        </button>
        <button type="button" data-active={isEdit} onClick={() => { setMode('edit'); setSelectedIndex(null) }}>
          편집 모드
        </button>
        <button type="button" data-active={mode === 'overview'} onClick={() => { setMode('overview'); setSelectedIndex(null) }}>
          전체 보기
        </button>
        <p className="mapMissionStatus" aria-live="polite">
          미션 v{missionVersion}
          {missionIndices.length > 0
            ? ` · 풀 idx ${missionIndices.join(', ')} (메인+오버레이 후보)`
            : ' · 미션용 책장 없음 (floorPlan 검출 책장·오버레이 레이어 모두 없음)'}
        </p>
      </div>

      <div className="mapMinimapWrap">
        <button
          type="button"
          className="mapMinimapButton"
          data-active={mode === 'overview'}
          aria-label="전체 보기 토글"
          onClick={() => {
            if (mode === 'firstPerson' || mode === 'thirdPerson') {
              setPrevWalkMode(mode)
              setMode('overview')
              setSelectedIndex(null)
            } else if (mode === 'overview') {
              setMode(prevWalkMode)
              setSelectedIndex(null)
            }
          }}
        >
          <span
            className="mapMinimapStack"
            style={{ aspectRatio: `${minimapSpanX} / ${minimapSpanZ}` }}
          >
            <img className="mapMinimapImage" src="/map-floor-2d.png" alt="" draggable={false} />
            <MinimapSvgOverlay
              viewportUv={minimapViewportUv}
              playerPos={minimapPlayerPos}
              navDimPath={navigationRoute?.dimPath ?? null}
              navHighlightPath={navigationRoute?.highlightPath ?? null}
              markerScale={1}
            />
          </span>
        </button>
      </div>
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
