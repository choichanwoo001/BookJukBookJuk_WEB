import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { isEditableDomTarget } from '../../utils/domTarget'
import {
  wallRects as baseWallRects,
  pillarRects,
  floorRects,
  floorFillRects,
  FLOOR_HEIGHT_M,
  ENTRANCE_SPAWN,
} from '../../data/floorPlan'
import { subscribeMapCommand } from '../../agent/runtime/agentEventBus'
import { axisAlignedBoundsForRotatedBookshelf } from '../../utils/bookshelfCollision'
import { useWorldMovement, INITIAL_PLAYER_POS } from '../../hooks/useWorldMovement'
import { syncPlayerPositionFromWorldRef } from '../../utils/playerWorldSync'
import { pathHeadingAtPoint } from '../../utils/pathSampling'
import {
  bookshelfOverlayLayerInstances,
  counterOverlayLayerInstances,
  isCounterOverlaidByBookshelfOverlayLayer,
} from '../../data/bookshelfOverlayLayer'
import {
  floorMaterial,
  bookshelfMaterial,
  bookshelfOverlayLayerMaterial,
  bookshelfOverlayInteriorWoodMaterial,
  displayLowMaterial,
  pillarMaterial,
  markerMaterial,
  areaMaterial,
  FIXED_SELECTION_RADIUS_M,
} from '../../config/constants'
import type { ViewMode, PickPoint, CircleSelection, FixtureRenderInstance } from '../../types/scene'
import type { Point2 } from '../../data/floorPlan'
import { WallRibbonMesh, EntranceDoorwayDecor } from './Walls'
import { FloorPolygonMesh, BookstoreLights } from './Floor'
import {
  PillarCylinderInstances,
  RotatedFixtureInstances,
  SelectedBookshelfOverlay,
} from './Fixtures'
import { SupermarketCounterInstances } from './SupermarketCounter'
import { BookshelfOverlayInterior } from './BookshelfOverlayInterior'
import type { MinimapUvPoint } from './MinimapViewportReporter'
import {
  PlayerPositionReporter,
  PlayerWorldXzReporter,
  EditDragController,
} from './reporters/SceneReporters'
import type { MinimapPlayerPos } from './reporters/SceneReporters'
import { TopDownRig, OverviewRig } from './rigs/CameraRigs'
import { useScenePickHandlers } from './useScenePickHandlers'
import { useSceneTopDownSync } from './useSceneTopDownSync'
import { useNavigationMovement } from '../../hooks/useNavigationMovement'
import type { VersoStatus } from '../../lib/verso/types'
import { NavigationRouteMesh } from './NavigationRouteMesh'
import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'
import type { RoutePathDisplayMode } from '../../utils/pathSmoothing'
import type { WalkabilityContext } from '../../utils/walkability'
import {
  resolveNavigationMobilityPhase,
  type NavigationMobilityPhase,
} from '../../types/navigationMobility'

export type { MinimapPlayerPos }

export function SceneContent({
  mode,
  activePane,
  editTool,
  bookshelfRenderInstances,
  staticFixtureInstances,
  selections,
  onAddSelection,
  selectedBookshelfIndex,
  onSelectBookshelf,
  onUpdateBookshelf,
  onMinimapViewportUv,
  onPlayerPosition,
  playerWorldXzRef,
  navigationRoute,
  navigationRouteVariant = 'preview',
  routePathDisplayMode = 'curved',
  walkabilityCtx,
  navHighlightPath = null,
  navCurrentGoal = null,
  demoNavigationActive = false,
  mobilityHold = false,
  onMobilityPhaseChange,
  onMovementSyncSample,
  onNavigationSpawnReady,
  scenarioPlaybackHeadingRef,
  robotSyncActive = false,
  robotStatus = null,
  robotLiveStatusRef,
}: {
  mode: ViewMode
  activePane: 'map' | 'chat'
  editTool: 'areaSelection' | 'bookshelfEdit'
  bookshelfRenderInstances: FixtureRenderInstance[]
  staticFixtureInstances: FixtureRenderInstance[]
  selections: CircleSelection[]
  onAddSelection: (point: PickPoint) => void
  selectedBookshelfIndex?: number | null
  onSelectBookshelf?: (index: number | null) => void
  onUpdateBookshelf?: (index: number, patch: Partial<FixtureRenderInstance>) => void
  onMinimapViewportUv?: (quad: MinimapUvPoint[] | null) => void
  onPlayerPosition?: (pos: MinimapPlayerPos | null) => void
  playerWorldXzRef?: RefObject<Point2 | null>
  navigationRoute?: NavigationRouteVisual | null
  navigationRouteVariant?: 'preview' | 'nav'
  routePathDisplayMode?: RoutePathDisplayMode
  walkabilityCtx?: WalkabilityContext
  navHighlightPath?: Point2[] | null
  navCurrentGoal?: Point2 | null
  demoNavigationActive?: boolean
  mobilityHold?: boolean
  onMobilityPhaseChange?: (phase: NavigationMobilityPhase) => void
  onMovementSyncSample?: (sample: { isManualWalking: boolean; isAutoWalking: boolean }) => void
  onNavigationSpawnReady?: () => void
  scenarioPlaybackHeadingRef?: RefObject<number | null>
  robotSyncActive?: boolean
  robotStatus?: VersoStatus | null
  robotLiveStatusRef?: RefObject<VersoStatus | null>
}) {
  const worldRef = useRef<Group>(null)
  const storedWorldPositionRef = useRef<[number, number]>([-INITIAL_PLAYER_POS[0], -INITIAL_PLAYER_POS[1]])
  const yawRef = useRef(0)
  const characterYawRef = useRef(0)
  const walkMovingRef = useRef(false)
  const playerPositionRef = useRef<[number, number]>([...INITIAL_PLAYER_POS])
  const navigationInitialHeadingRef = useRef<number | null>(null)
  const pathYawAppliedRef = useRef(false)
  const prevTopDownModeRef = useRef<'topDown' | null>(null)
  const isTopDown = mode === 'topDown'
  const isWalkMode = isTopDown
  const isEdit = mode === 'edit'
  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'
  const isAreaSelection = isEdit && editTool === 'areaSelection'
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const isBookshelfDraggingRef = useRef(false)
  const controlsEnabled = activePane === 'map' || demoNavigationActive
  const counterRenderInstances = useMemo(() => {
    const counters = staticFixtureInstances.filter((inst) => inst.kind === 'counter')
    return counters.filter((c) => !isCounterOverlaidByBookshelfOverlayLayer(c))
  }, [staticFixtureInstances])
  const displayRenderInstances = useMemo(
    () => staticFixtureInstances.filter((inst) => inst.kind === 'displayLow'),
    [staticFixtureInstances],
  )
  const bookshelfCollisionRects = useMemo(
    () =>
      bookshelfRenderInstances.map(inst =>
        axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw),
      ),
    [bookshelfRenderInstances],
  )
  const autoWalkActive = useNavigationMovement({
    worldRef,
    yawRef,
    characterYawRef,
    playerPositionRef,
    storedWorldPositionRef,
    playerWorldXzRef,
    robotSyncActive,
    robotStatus,
    robotLiveStatusRef,
    highlightPath: navHighlightPath,
    currentGoal: navCurrentGoal,
    demoNavigationActive,
    mobilityHold,
    isWalkMode,
  })

  useWorldMovement(
    worldRef,
    yawRef,
    isWalkMode && controlsEnabled && !robotSyncActive,
    {
      floorRects,
      wallRects: baseWallRects,
      bookshelfRects: bookshelfCollisionRects,
    },
    characterYawRef,
    walkMovingRef,
    controlsEnabled && !robotSyncActive && !autoWalkActive && !mobilityHold,
    playerPositionRef,
  )

  useSceneTopDownSync({
    mode,
    worldRef,
    storedWorldPositionRef,
    yawRef,
    prevTopDownModeRef,
    preserveHeadingOnEnter: robotSyncActive,
    playerWorldXzRef,
    scenarioPlaybackHeadingRef,
    characterYawRef,
    syncFromScenarioPreview: false,
    navigationHeadingRef: navigationInitialHeadingRef,
  })

  const applyPathAlignedYaw = useCallback((path: Point2[] | null | undefined) => {
    if (!path || path.length < 2) return
    const pos = playerPositionRef.current
    const heading = pathHeadingAtPoint(path, [pos[0], pos[1]])
    if (heading == null) return
    navigationInitialHeadingRef.current = heading
    yawRef.current = heading
    characterYawRef.current = heading + Math.PI
    pathYawAppliedRef.current = true
  }, [])

  useEffect(() => {
    if (pathYawAppliedRef.current) return
    applyPathAlignedYaw(navHighlightPath ?? navigationRoute?.highlightPath ?? navigationRoute?.planPath)
  }, [applyPathAlignedYaw, navHighlightPath, navigationRoute?.highlightPath, navigationRoute?.planPath])

  const highlightPathLength = navHighlightPath?.length ?? 0
  const mobilityPhase = useMemo(
    () =>
      resolveNavigationMobilityPhase({
        demoNavigationActive,
        demoAutoWalkActive: autoWalkActive,
        highlightPathLength,
      }),
    [autoWalkActive, demoNavigationActive, highlightPathLength],
  )

  useEffect(() => {
    onMobilityPhaseChange?.(mobilityPhase)
  }, [mobilityPhase, onMobilityPhaseChange])

  useEffect(() => {
    onMovementSyncSample?.({
      isManualWalking: walkMovingRef.current,
      isAutoWalking: autoWalkActive,
    })
  }, [autoWalkActive, onMovementSyncSample])

  const prevManualWalkingRef = useRef(false)
  useFrame(() => {
    const moving = walkMovingRef.current
    if (moving === prevManualWalkingRef.current) return
    prevManualWalkingRef.current = moving
    onMovementSyncSample?.({ isManualWalking: moving, isAutoWalking: autoWalkActive })
  })

  useLayoutEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      const wx = -ENTRANCE_SPAWN[0]
      const wz = -ENTRANCE_SPAWN[1]
      storedWorldPositionRef.current = [wx, wz]
      playerPositionRef.current[0] = ENTRANCE_SPAWN[0]
      playerPositionRef.current[1] = ENTRANCE_SPAWN[1]
      if (playerWorldXzRef) {
        playerWorldXzRef.current = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
      }
      if (worldRef.current) {
        worldRef.current.position.set(wx, 0, wz)
      }
      if (scenarioPlaybackHeadingRef) {
        scenarioPlaybackHeadingRef.current = null
      }
      pathYawAppliedRef.current = false
      navigationInitialHeadingRef.current = null
      onNavigationSpawnReady?.()
    })
  }, [onNavigationSpawnReady, playerWorldXzRef, scenarioPlaybackHeadingRef])

  useEffect(() => {
    if (!isWalkMode) return
    syncPlayerPositionFromWorldRef(worldRef, playerPositionRef)
  }, [isWalkMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!controlsEnabled) return
      if (event.code !== 'Space') return
      if (isEditableDomTarget(event.target)) return
      event.preventDefault()
      setIsSpacePressed(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setIsSpacePressed(false)
    }
    const handleWindowBlur = () => {
      setIsSpacePressed(false)
    }
    const handleVisibilityChange = () => {
      if (document.hidden) setIsSpacePressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [controlsEnabled])

  const {
    floorPickHandler,
    wallPickHandler,
    bookshelfPickHandler,
    pillarPickHandler,
  } = useScenePickHandlers({ isAreaSelection, worldRef, onAddSelection })

  const handleBookshelfPointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!isBookshelfEdit || !onSelectBookshelf) return
    if (!event.altKey) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const instanceId = event.instanceId
    if (instanceId === undefined || instanceId === null) return
    if (isBookshelfDraggingRef.current) return

    onSelectBookshelf(instanceId)
  }, [isBookshelfEdit, onSelectBookshelf])

  const handleDragStart = useCallback(() => {
    isBookshelfDraggingRef.current = true
  }, [])

  const handleDragEnd = useCallback(() => {
    isBookshelfDraggingRef.current = false
  }, [])

  const selectedInst = selectedBookshelfIndex !== null && selectedBookshelfIndex !== undefined
    ? bookshelfRenderInstances[selectedBookshelfIndex]
    : null

  return (
    <>
      <color attach="background" args={['#1a1410']} />
      <ambientLight color="#FFF5E6" intensity={0.5} />
      <directionalLight position={[20, 30, 10]} color="#FFECD2" intensity={0.8} />
      <directionalLight position={[-20, 25, -15]} color="#FFECD2" intensity={0.3} />

      {isTopDown ? (
        <TopDownRig
          controlsEnabled={controlsEnabled}
          robotFollowMode={robotSyncActive}
          yawRef={yawRef}
        />
      ) : (
        <OverviewRig
          mode={mode}
          isEdit={isEdit}
          controlsEnabled={controlsEnabled}
          onMinimapViewportUv={onMinimapViewportUv}
        />
      )}

      {onPlayerPosition && (
        <PlayerPositionReporter
          worldRef={worldRef}
          characterYawRef={characterYawRef}
          onPlayerPosition={onPlayerPosition}
        />
      )}
      {playerWorldXzRef && (
        <PlayerWorldXzReporter
          worldRef={worldRef}
          storedWorldPositionRef={storedWorldPositionRef}
          isWalkMode={isWalkMode}
          playerWorldXzRef={playerWorldXzRef}
        />
      )}

      {isBookshelfEdit && onUpdateBookshelf && (
        <EditDragController
          selectedIndex={selectedBookshelfIndex ?? null}
          instances={bookshelfRenderInstances}
          onUpdate={onUpdateBookshelf}
          suspend={isSpacePressed}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}

      <group ref={worldRef}>
        <group userData={{ excludeCameraCollision: true }}>
          <FloorPolygonMesh
            yOffset={0}
            material={floorMaterial}
            fillRects={floorFillRects}
            onPointerDown={floorPickHandler}
          />
        </group>
        <BookshelfOverlayInterior
          instances={bookshelfOverlayLayerInstances}
          shellMaterial={bookshelfOverlayLayerMaterial}
          woodMaterial={bookshelfOverlayInteriorWoodMaterial}
        />
        <group userData={{ excludeCameraCollision: true }}>
          <SupermarketCounterInstances
            instances={counterOverlayLayerInstances}
            overlayCandidate
            disableRaycast
          />
        </group>
        <WallRibbonMesh
          onPointerDown={wallPickHandler}
        />
        <EntranceDoorwayDecor />
        <RotatedFixtureInstances
          instances={bookshelfRenderInstances}
          material={bookshelfMaterial}
          onPointerDown={
            isBookshelfEdit
              ? handleBookshelfPointerDown
              : bookshelfPickHandler
          }
        />
        <SupermarketCounterInstances
          instances={counterRenderInstances}
          onPointerDown={bookshelfPickHandler}
        />
        <RotatedFixtureInstances
          instances={displayRenderInstances}
          material={displayLowMaterial}
          onPointerDown={bookshelfPickHandler}
        />
        {isBookshelfEdit && selectedInst && (
          <group userData={{ excludeCameraCollision: true }}>
            <SelectedBookshelfOverlay instance={selectedInst} />
          </group>
        )}
        <PillarCylinderInstances
          rects={pillarRects}
          height={FLOOR_HEIGHT_M}
          yOffset={0}
          material={pillarMaterial}
          onPointerDown={pillarPickHandler}
        />
        <BookstoreLights floorRenderRects={floorRects} />
        {navigationRoute && (
          <NavigationRouteMesh
            route={navigationRoute}
            variant={navigationRouteVariant}
            walkabilityCtx={walkabilityCtx}
            pathDisplayMode={routePathDisplayMode}
          />
        )}
        {selections.map((selection) => (
          <group key={selection.id} userData={{ excludeCameraCollision: true }}>
            <mesh position={[selection.center.x, selection.center.y + 0.1, selection.center.z]}>
              <sphereGeometry args={[0.12, 14, 14]} />
              <primitive object={markerMaterial} attach="material" />
            </mesh>
            <mesh position={[selection.center.x, Math.max(0.02, selection.center.y + 0.03), selection.center.z]}>
              <cylinderGeometry args={[FIXED_SELECTION_RADIUS_M, FIXED_SELECTION_RADIUS_M, 0.05, 48]} />
              <primitive object={areaMaterial} attach="material" />
            </mesh>
          </group>
        ))}
      </group>
    </>
  )
}
