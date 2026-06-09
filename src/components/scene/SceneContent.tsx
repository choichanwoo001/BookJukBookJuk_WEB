import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { isEditableDomTarget } from '../../utils/domTarget'
import {
  wallRects as baseWallRects,
  pillarRects,
  floorRects,
  floorFillRects,
  FLOOR_HEIGHT_M,
} from '../../data/floorPlan'
import { axisAlignedBoundsForRotatedBookshelf } from '../../utils/bookshelfCollision'
import { useWorldMovement, INITIAL_PLAYER_POS } from '../../hooks/useWorldMovement'
import {
  bookshelfOverlayLayerInstances,
  counterOverlayLayerInstances,
  isCounterOverlaidByBookshelfOverlayLayer,
} from '../../data/bookshelfOverlayLayer'
import {
  FIRST_PERSON_DEFAULT_PITCH,
  THIRD_PERSON_LOCKED_PITCH,
  floorMaterial,
  ceilingMaterial,
  bookshelfMaterial,
  bookshelfOverlayLayerMaterial,
  bookshelfOverlayInteriorWoodMaterial,
  displayLowMaterial,
  pillarMaterial,
  markerMaterial,
  areaMaterial,
  FIXED_SELECTION_RADIUS_M,
  WALK_DEFAULT_FOV,
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
import { ThirdPersonOcclusionFader } from './ThirdPersonOcclusionFader'
import type { MinimapUvPoint } from './MinimapViewportReporter'
import {
  PlayerPositionReporter,
  PlayerWorldXzReporter,
  EditDragController,
} from './reporters/SceneReporters'
import type { MinimapPlayerPos } from './reporters/SceneReporters'
import { WalkRig, OverviewRig } from './rigs/CameraRigs'
import { useScenePickHandlers } from './useScenePickHandlers'
import { useSceneWalkModeSync } from './useSceneWalkModeSync'
import { useVersoRobotSync } from '../../hooks/useVersoRobotSync'
import type { VersoStatus } from '../../lib/verso/types'
import { NavigationRouteMesh } from './NavigationRouteMesh'
import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'

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
  forwardArrowRef,
  walkFov = WALK_DEFAULT_FOV,
  onWalkFovChange,
  onMinimapViewportUv,
  onPlayerPosition,
  playerWorldXzRef,
  navigationRoute,
  robotSyncActive = false,
  robotStatus = null,
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
  forwardArrowRef?: RefObject<HTMLDivElement | null>
  walkFov?: number
  onWalkFovChange?: (fov: number) => void
  onMinimapViewportUv?: (quad: MinimapUvPoint[] | null) => void
  onPlayerPosition?: (pos: MinimapPlayerPos | null) => void
  playerWorldXzRef?: RefObject<Point2 | null>
  navigationRoute?: NavigationRouteVisual | null
  robotSyncActive?: boolean
  robotStatus?: VersoStatus | null
}) {
  const worldRef = useRef<Group>(null)
  const storedWorldPositionRef = useRef<[number, number]>([-INITIAL_PLAYER_POS[0], -INITIAL_PLAYER_POS[1]])
  const yawRef = useRef(0)
  const pitchRef = useRef(FIRST_PERSON_DEFAULT_PITCH)
  const characterYawRef = useRef(0)
  const isFreeLookRef = useRef(false)
  const mouseLookDraggingRef = useRef(false)
  const walkMovingRef = useRef(false)
  const prevWalkModeRef = useRef<'firstPerson' | 'thirdPerson' | null>(null)
  const isFirstPerson = mode === 'firstPerson'
  const isThirdPerson = mode === 'thirdPerson'
  const isWalkMode = isFirstPerson || isThirdPerson
  const isEdit = mode === 'edit'
  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'
  const isAreaSelection = isEdit && editTool === 'areaSelection'
  /** 전시대(displayLow)는 바닥 밖에 안 보이도록 1인칭에서만 표시. */
  const showDisplayLowFixtures = isFirstPerson
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const isBookshelfDraggingRef = useRef(false)
  const controlsEnabled = activePane === 'map'
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
  useWorldMovement(worldRef, yawRef, isWalkMode && controlsEnabled && !robotSyncActive, {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: bookshelfCollisionRects,
  }, characterYawRef, walkMovingRef, controlsEnabled && !robotSyncActive)

  useVersoRobotSync({
    robotSyncActive,
    status: robotStatus,
    worldRef,
    storedWorldPositionRef,
    playerWorldXzRef,
    yawRef,
    characterYawRef,
    isWalkMode,
  })

  useSceneWalkModeSync({
    mode,
    worldRef,
    storedWorldPositionRef,
    yawRef,
    pitchRef,
    prevWalkModeRef,
    preserveHeadingOnEnter: robotSyncActive,
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!controlsEnabled) return
      if (event.code !== 'Space') return
      if (isEditableDomTarget(event.target)) return
      event.preventDefault()
      setIsSpacePressed(true)
      isFreeLookRef.current = false
      yawRef.current = characterYawRef.current
      if (mode === 'firstPerson') pitchRef.current = FIRST_PERSON_DEFAULT_PITCH
      else if (mode === 'thirdPerson') pitchRef.current = THIRD_PERSON_LOCKED_PITCH
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
  }, [controlsEnabled, mode])

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

      {isWalkMode ? (
        <WalkRig
          mode={isFirstPerson ? 'firstPerson' : 'thirdPerson'}
          walkFov={walkFov}
          controlsEnabled={controlsEnabled}
          yawRef={yawRef}
          pitchRef={pitchRef}
          characterYawRef={characterYawRef}
          worldRef={worldRef}
          isFreeLookRef={isFreeLookRef}
          mouseLookDraggingRef={mouseLookDraggingRef}
          forwardArrowRef={forwardArrowRef}
          onWalkFovChange={onWalkFovChange}
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
        {isWalkMode && (
          <group userData={{ excludeCameraCollision: true }}>
            <FloorPolygonMesh
              yOffset={FLOOR_HEIGHT_M}
              material={ceilingMaterial}
              fillRects={floorFillRects}
            />
          </group>
        )}
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
        {showDisplayLowFixtures && (
          <RotatedFixtureInstances
            instances={displayRenderInstances}
            material={displayLowMaterial}
            onPointerDown={bookshelfPickHandler}
          />
        )}
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
          <NavigationRouteMesh route={navigationRoute} />
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
      {isThirdPerson && (
        <ThirdPersonOcclusionFader enabled worldRef={worldRef} />
      )}
    </>
  )
}
