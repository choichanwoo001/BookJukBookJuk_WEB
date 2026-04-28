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
import { pickMissionIndicesSeeded } from '../utils/missionPick'
import { useNavigationRoute } from '../hooks/useNavigationRoute'
import {
  FIXED_SELECTION_RADIUS_M,
  THIRD_PERSON_DEFAULT_FOV,
  WALK_DEFAULT_FOV,
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
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import {
  AGENT_MAP_EVENT_VERSION,
  publishMapSnapshot,
  subscribeMapCommand,
  type AgentMapCommand,
} from '../agent/runtime/agentEventBus'
import { buildMissionShelfPool, buildNavBookshelfRects } from '../utils/missionShelfPool'
import { MapViewButtons } from './map/MapViewButtons'
import { MapMinimapPanel } from './map/MapMinimapPanel'

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

function Map3DView({
  activePane,
  onActivateMap,
}: {
  activePane: 'map' | 'chat'
  onActivateMap: () => void
}) {
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

  const missionBookshelfPool = useMemo(
    () => buildMissionShelfPool(instances, bookshelfOverlayLayerInstances),
    [instances],
  )

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
  const navBookshelfRects = useMemo(
    () => buildNavBookshelfRects(instances, bookshelfOverlayLayerInstances),
    [instances],
  )
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

  const handleViewModeChange = useCallback((next: ViewMode) => {
    setMode(next)
    setSelectedIndex(null)
  }, [setSelectedIndex])

  const handleMinimapToggle = useCallback(() => {
    if (mode === 'firstPerson' || mode === 'thirdPerson') {
      setPrevWalkMode(mode)
      setMode('overview')
      setSelectedIndex(null)
    } else if (mode === 'overview') {
      setMode(prevWalkMode)
      setSelectedIndex(null)
    }
  }, [mode, prevWalkMode, setSelectedIndex])

  useEffect(() => {
    if (selections.length === 0) return
    const text = selections.map(selectionToText).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }, [selections])

  useEffect(() => {
    if (mode !== 'edit' || editTool !== 'bookshelfEdit') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (activePane !== 'map') return
      if (e.code !== 'KeyE') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableDomTarget(e.target)) return
      e.preventDefault()
      setSelectedIndex(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePane, mode, editTool, setSelectedIndex])

  useEffect(() => {
    return subscribeMapCommand((command: AgentMapCommand) => {
      if (command.type === 'REPLAN_SHORTEST') {
        handleNewMission()
      }
      if (command.type === 'PAUSE_MOBILITY' && (mode === 'firstPerson' || mode === 'thirdPerson')) {
        setPrevWalkMode(mode)
        setMode('overview')
      }
      if (command.type === 'RESUME_MOBILITY' && mode === 'overview') {
        setMode(prevWalkMode)
      }
    })
  }, [handleNewMission, mode, prevWalkMode])

  useEffect(() => {
    publishMapSnapshot({
      version: AGENT_MAP_EVENT_VERSION,
      playerXz: playerWorldXzRef.current,
      missionVersion,
      activeLeg: navigationRoute?.activeLeg ?? null,
    })
  }, [missionVersion, navigationRoute?.activeLeg, minimapPlayerPos])

  const selected = selectedIndex !== null ? instances[selectedIndex] : null

  return (
    <div
      className="map3DContainer"
      data-active-pane={activePane === 'map'}
      onPointerDown={onActivateMap}
    >
      <Canvas dpr={[1, 2]} style={{ zIndex: 0 }}>
        <SceneContent
          mode={mode}
          activePane={activePane}
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

        <MapViewButtons
          mode={mode}
          isEdit={isEdit}
          showMapDiffLayer={showMapDiffLayer}
          showBookshelfOverlayLayer={showBookshelfOverlayLayer}
          missionVersion={missionVersion}
          missionIndices={missionIndices}
          onShowMapDiffChange={setShowMapDiffLayer}
          onShowBookshelfOverlayChange={setShowBookshelfOverlayLayer}
          onNewMission={handleNewMission}
          onModeChange={handleViewModeChange}
        />

        <MapMinimapPanel
          mode={mode}
          spanX={minimapSpanX}
          spanZ={minimapSpanZ}
          viewportUv={minimapViewportUv}
          playerPos={minimapPlayerPos}
          navDimPath={navigationRoute?.dimPath ?? null}
          navHighlightPath={navigationRoute?.highlightPath ?? null}
          onClick={handleMinimapToggle}
        />
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
