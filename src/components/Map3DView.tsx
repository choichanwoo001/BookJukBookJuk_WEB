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
} from '../config/constants'
import { useBookshelfInstances } from '../hooks/useBookshelfInstances'
import { useBookshelfClipboard } from '../hooks/useBookshelfClipboard'
import type { CircleSelection, PickPoint, FixtureRenderInstance } from '../types/scene'
import type { MinimapUvPoint } from './scene/MinimapViewportReporter'
import { getMinimapWorldBounds } from '../utils/minimapBounds'
import { createOverviewFlipEvents } from '../utils/overviewDisplayFlip'
import { isEditableDomTarget } from '../utils/domTarget'
import { SceneContent } from './scene/SceneContent'
import { BookshelfEditPanel } from './BookshelfEditPanel'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { buildMissionShelfPool, buildNavBookshelfRects } from '../utils/missionShelfPool'
import { MapViewButtons } from './map/MapViewButtons'
import { MapMinimapPanel } from './map/MapMinimapPanel'
import { useMapViewState } from '../hooks/useMapViewState'
import { useVersoRosbridge } from '../hooks/useVersoRosbridge'
import { buildVersoRouteVisual } from '../utils/versoPathVisual'
import { VersoConnectionPanel } from './map/VersoConnectionPanel'

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

function Map3DView({
  activePane,
  onActivateMap,
}: {
  activePane: 'map' | 'chat'
  onActivateMap: () => void
}) {
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [minimapViewportUv, setMinimapViewportUv] = useState<MinimapUvPoint[] | null>(null)
  const [versoActiveUrl, setVersoActiveUrl] = useState<string | null>(null)
  const playerWorldXzRef = useRef<Point2 | null>(null)
  const navigationActiveLegRef = useRef<number | null>(null)
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

  const clearSelection = useCallback(() => {
    setSelectedIndex(null)
  }, [setSelectedIndex])

  const {
    mode,
    isEdit,
    isOverviewLike,
    missionVersion,
    minimapPlayerPos,
    setMinimapPlayerPos,
    walkFov,
    handleViewModeChange,
    handleMinimapToggle,
    handleWalkFovChange,
  } = useMapViewState({
    playerWorldXzRef,
    activeLegRef: navigationActiveLegRef,
    clearSelection,
  })

  const missionBookshelfPool = useMemo(
    () => buildMissionShelfPool(instances, bookshelfOverlayLayerInstances),
    [instances],
  )

  const missionIndices = useMemo(() => {
    const pool = missionBookshelfPool.map((_, i) => i)
    return pickMissionIndicesSeeded(pool, missionVersion)
  }, [missionBookshelfPool, missionVersion])

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

  const {
    connectionState: versoConnectionState,
    lastStatus: versoStatus,
    lastPath: versoPath,
    robotSyncActive,
  } = useVersoRosbridge(versoActiveUrl)

  const robotRoute = useMemo(
    () => buildVersoRouteVisual(versoStatus, versoPath),
    [versoStatus, versoPath],
  )
  const displayRoute = robotRoute ?? navigationRoute

  useEffect(() => {
    navigationActiveLegRef.current = navigationRoute?.activeLeg ?? null
  }, [navigationRoute?.activeLeg])

  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'

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

  const selected = selectedIndex !== null ? instances[selectedIndex] : null
  const overviewFlipEvents = useMemo(
    () => (isOverviewLike ? createOverviewFlipEvents() : undefined),
    [isOverviewLike],
  )

  return (
    <div
      className="map3DContainer"
      data-active-pane={activePane === 'map'}
      onPointerDown={onActivateMap}
    >
      <Canvas
        dpr={[1, 2]}
        events={overviewFlipEvents}
        style={{
          zIndex: 0,
          transform: isOverviewLike ? 'scaleY(-1)' : undefined,
        }}
      >
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
          forwardArrowRef={forwardArrowRef}
          walkFov={walkFov}
          onWalkFovChange={handleWalkFovChange}
          onMinimapViewportUv={handleMinimapViewportUv}
          onPlayerPosition={setMinimapPlayerPos}
          playerWorldXzRef={playerWorldXzRef}
          navigationRoute={displayRoute}
          robotSyncActive={robotSyncActive}
          robotStatus={versoStatus}
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
          missionVersion={missionVersion}
          missionIndices={missionIndices}
          onModeChange={handleViewModeChange}
        />

        <MapMinimapPanel
          mode={mode}
          spanX={minimapSpanX}
          spanZ={minimapSpanZ}
          viewportUv={minimapViewportUv}
          playerPos={minimapPlayerPos}
          navDimPath={displayRoute?.dimPath ?? null}
          navHighlightPath={displayRoute?.highlightPath ?? null}
          onClick={handleMinimapToggle}
        />

        <VersoConnectionPanel
          connectionState={versoConnectionState}
          onConnect={setVersoActiveUrl}
          onDisconnect={() => setVersoActiveUrl(null)}
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
