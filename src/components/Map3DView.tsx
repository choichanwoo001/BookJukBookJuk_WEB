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
import { useAgentMission } from '../hooks/useAgentMission'
import { resolveMissionPoolIndices } from '../utils/bookShelfNavigation'
import { checkoutDirectGoals } from '../utils/counterNavigation'
import {
  subscribeMapCommand,
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  publishNavigationSync,
} from '../agent/runtime/agentEventBus'
import { isDemoMode } from '../config/demoMode'
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
import { BookRecognitionPanel } from './BookRecognitionPanel'
import type { GestureId } from '../lib/gestureClassifiers'
import { MapControlDock } from './map/MapControlDock'
import { MapMinimapPanel } from './map/MapMinimapPanel'
import { ScenarioRoutePlannerPanel } from './map/ScenarioRoutePlannerPanel'
import { useMapViewState } from '../hooks/useMapViewState'
import { useVersoRosbridge } from '../hooks/useVersoRosbridge'
import { buildVersoRouteVisual } from '../utils/versoPathVisual'
import { NAVIGATION_MOBILITY_PHASE_LABELS } from '../types/navigationMobility'
import { useScenarioRoutePreview } from '../hooks/useScenarioRoutePreview'
import { tryPublishVersoCommand } from '../lib/verso/versoCommandBridge'
import { buildDemoScenarioRoute } from '../utils/demoScenarioRoute'
import { pathLengthM } from '../utils/pathSampling'
import type { RoutePathDisplayMode } from '../utils/pathSmoothing'

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
  busy,
  onBookCapture,
  onBookBrowse,
  onGestureConfirmed,
  usersId,
  isFullscreen,
  onToggleFullscreen,
  onResetOnboarding,
  ttsSpeaking = false,
}: {
  activePane: 'map' | 'chat'
  onActivateMap: () => void
  busy: boolean
  ttsSpeaking?: boolean
  onBookCapture: (
    reason: 'add' | 'remove' | 'browse',
    imageBase64: string,
    trigger?: 'gesture' | 'ui',
  ) => void | Promise<void>
  onBookBrowse?: (imageBase64: string) => void | Promise<void>
  onGestureConfirmed?: (gestureId: GestureId) => void
  usersId: string | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onResetOnboarding: () => void
}) {
  const [controlsVisible, setControlsVisible] = useState(true)
  const [scenarioRouteOpen, setScenarioRouteOpen] = useState(false)
  const [editTool, setEditTool] = useState<'areaSelection' | 'bookshelfEdit'>('bookshelfEdit')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const [minimapViewportUv, setMinimapViewportUv] = useState<MinimapUvPoint[] | null>(null)
  const [versoActiveUrl, setVersoActiveUrl] = useState<string | null>(null)
  const [checkoutGoals, setCheckoutGoals] = useState<Point2[] | null>(null)
  const [routePathDisplayMode, setRoutePathDisplayMode] =
    useState<RoutePathDisplayMode>('curved')
  const checkoutArrivedRef = useRef(false)
  const playerWorldXzRef = useRef<Point2 | null>(null)
  const navigationActiveLegRef = useRef<number | null>(null)
  const [navigationSpawnReady, setNavigationSpawnReady] = useState(true)
  const [movementSync, setMovementSync] = useState({
    isManualWalking: false,
    isAutoWalking: false,
  })
  const staticInstances = useMemo(() => buildStaticInstances(), [])
  const { spanX: minimapSpanX, spanZ: minimapSpanZ } = useMemo(() => getMinimapWorldBounds(), [])
  const forwardArrowRef = useRef<HTMLDivElement>(null)

  const handleMinimapViewportUv = useCallback((quad: MinimapUvPoint[] | null) => {
    setMinimapViewportUv(quad)
  }, [])

  const handleNavigationSpawnReady = useCallback(() => {
    setNavigationSpawnReady(true)
  }, [])

  const handleMovementSyncSample = useCallback(
    (sample: { isManualWalking: boolean; isAutoWalking: boolean }) => {
      setMovementSync(sample)
    },
    [],
  )

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'START_NAVIGATION') {
        setNavigationSpawnReady(false)
      }
    })
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
    missionVersion,
    routeDisplaySurface,
    minimapPlayerPos,
    setMinimapPlayerPos,
    walkFov,
    handleViewModeChange,
    handleMinimapToggle,
    handleWalkFovChange,
    startNavigationView,
  } = useMapViewState({
    playerWorldXzRef,
    activeLegRef: navigationActiveLegRef,
    clearSelection,
  })

  const {
    demoNavigationActive,
    demoMobilityPaused,
    handleMobilityPhaseChange,
    mobilityPhase,
    pauseDemoMobility,
    scenarioDirectGoals,
    scenarioPlaybackHeadingRef,
    scenarioRoutePreviewActive,
  } = useScenarioRoutePreview({
    playerWorldXzRef,
    setMinimapPlayerPos,
    startNavigationView,
  })

  const prevDemoNavigationActiveRef = useRef(false)
  useEffect(() => {
    const justStarted = demoNavigationActive && !prevDemoNavigationActiveRef.current
    prevDemoNavigationActiveRef.current = demoNavigationActive
    if (justStarted && mode !== 'firstPerson' && mode !== 'thirdPerson') {
      startNavigationView()
    }
  }, [demoNavigationActive, mode, startNavigationView])

  const handlePauseDemoMobility = useCallback(() => {
    tryPublishVersoCommand('stop')
    pauseDemoMobility()
  }, [pauseDemoMobility])

  const agentMission = useAgentMission(missionVersion)

  const missionBookshelfPool = useMemo(
    () => buildMissionShelfPool(instances, bookshelfOverlayLayerInstances),
    [instances],
  )

  const fallbackMissionIndices = useMemo(() => {
    const pool = missionBookshelfPool.map((_, i) => i)
    return pickMissionIndicesSeeded(pool, agentMission.missionVersion)
  }, [missionBookshelfPool, agentMission.missionVersion])

  const missionIndices = useMemo(() => {
    if (agentMission.poolIndices && agentMission.poolIndices.length > 0) {
      return resolveMissionPoolIndices(
        agentMission.poolIndices,
        missionBookshelfPool.length,
        agentMission.missionVersion,
      )
    }
    if (isDemoMode()) return []
    return fallbackMissionIndices
  }, [agentMission.poolIndices, agentMission.missionVersion, fallbackMissionIndices, missionBookshelfPool.length])

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

  const directGoals = useMemo(() => {
    if (scenarioDirectGoals && scenarioDirectGoals.length > 0) return scenarioDirectGoals
    if (agentMission.directGoals && agentMission.directGoals.length > 0) {
      return agentMission.directGoals
    }
    if (checkoutGoals && checkoutGoals.length > 0) return checkoutGoals
    return null
  }, [scenarioDirectGoals, agentMission.directGoals, checkoutGoals])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'GO_CHECKOUT') {
        checkoutArrivedRef.current = false
        setCheckoutGoals(checkoutDirectGoals(navCtx, navBounds, playerWorldXzRef.current))
      }
    })
  }, [navBounds, navCtx])

  const navigationRoute = useNavigationRoute({
    missionIndices,
    directGoals,
    missionPoolIndices: agentMission.poolIndices ?? missionIndices,
    missionVersion: agentMission.missionVersion,
    bookshelfInstances: missionBookshelfPool,
    playerXzRef: playerWorldXzRef,
    ctx: navCtx,
    bounds: navBounds,
    suppressDwellEvents: scenarioRoutePreviewActive || !navigationSpawnReady || demoMobilityPaused,
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
  const isWalkMode = mode === 'firstPerson' || mode === 'thirdPerson'
  const demoScenarioRoute = useMemo(() => {
    if (!scenarioRoutePreviewActive || demoNavigationActive) return null
    return buildDemoScenarioRoute()
  }, [demoNavigationActive, scenarioRoutePreviewActive])
  const showScenarioPlanOnMain =
    scenarioRoutePreviewActive && !demoNavigationActive && !isWalkMode
  const showMinimapNavigation = !showScenarioPlanOnMain && (demoNavigationActive || isWalkMode)
  const mainScenarioRoute = showScenarioPlanOnMain ? demoScenarioRoute : null
  const mainNavigationRoute =
    showScenarioPlanOnMain
      ? null
      : routeDisplaySurface === 'main' || isWalkMode
        ? displayRoute
        : null
  const minimapNavDimPath = showScenarioPlanOnMain
    ? null
    : showMinimapNavigation
      ? displayRoute?.planPath ?? null
      : null
  const minimapNavHighlightPath = showScenarioPlanOnMain
    ? null
    : showMinimapNavigation
      ? displayRoute?.highlightPath ?? null
      : null

  const minimapViewportForPanel = isWalkMode ? null : minimapViewportUv

  useEffect(() => {
    navigationActiveLegRef.current = navigationRoute?.activeLeg ?? null
  }, [navigationRoute?.activeLeg])

  const highlightPathLengthM = useMemo(() => {
    const path = navigationRoute?.highlightPath
    if (!path || path.length < 2) return null
    return pathLengthM(path)
  }, [navigationRoute?.highlightPath])

  useEffect(() => {
    publishNavigationSync({
      version: AGENT_MAP_EVENT_VERSION,
      navigationActive: demoNavigationActive,
      mobilityPhase,
      activeLeg: navigationRoute?.activeLeg ?? null,
      distanceToGoalM: navigationRoute?.highlightDistanceToGoalM ?? null,
      highlightPathLengthM,
      isAutoWalking: movementSync.isAutoWalking,
      isManualWalking: movementSync.isManualWalking,
      isWalkMode,
      navigationSpawnReady,
      ttsSpeaking,
    })
  }, [
    demoNavigationActive,
    highlightPathLengthM,
    isWalkMode,
    mobilityPhase,
    movementSync.isAutoWalking,
    movementSync.isManualWalking,
    navigationRoute?.activeLeg,
    navigationRoute?.highlightDistanceToGoalM,
    navigationSpawnReady,
    ttsSpeaking,
  ])

  useEffect(() => {
    if (!checkoutGoals?.length || !navigationRoute) return
    if (navigationRoute.activeLeg >= navigationRoute.goals.length && !checkoutArrivedRef.current) {
      checkoutArrivedRef.current = true
      dispatchDwellEvent({ type: 'CHECKOUT_ARRIVED', version: AGENT_MAP_EVENT_VERSION })
    }
  }, [checkoutGoals, navigationRoute])

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
  const canvasFlipEvents = useMemo(() => createOverviewFlipEvents(), [])

  return (
    <div
      className="map3DContainer"
      data-active-pane={activePane === 'map'}
      data-controls-visible={controlsVisible ? 'true' : 'false'}
      onPointerDown={onActivateMap}
    >
      <Canvas
        dpr={[1, 2]}
        events={canvasFlipEvents}
        style={{ zIndex: 0, transform: 'scaleY(-1)' }}
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
          navigationRoute={mainNavigationRoute}
          scenarioRoute={mainScenarioRoute}
          routePathDisplayMode={routePathDisplayMode}
          walkabilityCtx={navCtx}
          navigationRouteVariant={isWalkMode ? 'nav' : 'preview'}
          navHighlightPath={navigationRoute?.highlightPath ?? null}
          navCurrentGoal={navigationRoute?.currentGoal ?? null}
          demoNavigationActive={demoNavigationActive}
          scenarioRoutePreviewActive={scenarioRoutePreviewActive}
          ttsSpeaking={ttsSpeaking}
          onMobilityPhaseChange={handleMobilityPhaseChange}
          onMovementSyncSample={handleMovementSyncSample}
          onNavigationSpawnReady={handleNavigationSpawnReady}
          scenarioPlaybackHeadingRef={scenarioPlaybackHeadingRef}
          robotSyncActive={robotSyncActive}
          robotStatus={versoStatus}
        />
      </Canvas>

      <div className="map3DUiLayer">
        <BookRecognitionPanel
          busy={busy}
          onCapture={onBookCapture}
          onBrowse={onBookBrowse ?? ((frame) => onBookCapture('browse', frame))}
          onGestureConfirmed={onGestureConfirmed}
          placement="map"
        />

        {(mode === 'firstPerson' || mode === 'thirdPerson') && (
          <div className="map3DForwardHud">
            <div ref={forwardArrowRef} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 22,18 14,14 6,18" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}

        <MapMinimapPanel
          mode={mode}
          spanX={minimapSpanX}
          spanZ={minimapSpanZ}
          viewportUv={minimapViewportForPanel}
          playerPos={showScenarioPlanOnMain ? null : minimapPlayerPos}
          navDimPath={minimapNavDimPath}
          navHighlightPath={minimapNavHighlightPath}
          navSegmentPaths={null}
          walkabilityCtx={navCtx}
          pathDisplayMode={routePathDisplayMode}
          onClick={handleMinimapToggle}
        />

        <ScenarioRoutePlannerPanel
          open={scenarioRouteOpen}
          onClose={() => setScenarioRouteOpen(false)}
        />

        {isDemoMode() && demoNavigationActive && !demoMobilityPaused && (
          <div className="navigationMobilityHud" role="status">
            <span className="navigationMobilityHudLabel">
              {mobilityPhase !== 'idle'
                ? NAVIGATION_MOBILITY_PHASE_LABELS[mobilityPhase]
                : '데모 안내 중…'}
            </span>
            <button
              type="button"
              className="navigationMobilityHudStop"
              onClick={handlePauseDemoMobility}
            >
              정지
            </button>
          </div>
        )}

        <MapControlDock
          visible={controlsVisible}
          onToggleVisible={() => setControlsVisible((v) => !v)}
          usersId={usersId}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onResetOnboarding={onResetOnboarding}
          mode={mode}
          isEdit={isEdit}
          onModeChange={handleViewModeChange}
          routePathDisplayMode={routePathDisplayMode}
          onRoutePathDisplayModeChange={setRoutePathDisplayMode}
          versoConnectionState={versoConnectionState}
          onVersoConnect={setVersoActiveUrl}
          onVersoDisconnect={() => setVersoActiveUrl(null)}
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
