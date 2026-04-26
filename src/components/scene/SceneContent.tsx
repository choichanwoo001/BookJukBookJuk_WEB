import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
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
  MAP_VIEW_YAW_OFFSET_RAD,
} from '../../config/constants'
import type { ViewMode, SurfaceKind, PickPoint, CircleSelection, FixtureRenderInstance } from '../../types/scene'
import type { Point2 } from '../../data/floorPlan'
import { WallRibbonMesh, EntranceDoorwayDecor } from './Walls'
import { FloorPolygonMesh, BookstoreLights } from './Floor'
import {
  PillarCylinderInstances,
  RotatedFixtureInstances,
  SelectedBookshelfOverlay,
} from './Fixtures'
import { SupermarketCounterInstances } from './SupermarketCounter'
import { MapDiffOverlayMesh } from './MapDiffOverlayMesh'
import { BookshelfOverlayInterior } from './BookshelfOverlayInterior'
import { ThirdPersonOcclusionFader } from './ThirdPersonOcclusionFader'
import type { MinimapUvPoint } from './MinimapViewportReporter'
import { NavigationRouteMesh } from './NavigationRouteMesh'
import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'
import {
  PlayerPositionReporter,
  PlayerWorldXzReporter,
  EditDragController,
} from './reporters/SceneReporters'
import type { MinimapPlayerPos } from './reporters/SceneReporters'
import { WalkRig, OverviewRig } from './rigs/CameraRigs'

export type { MinimapPlayerPos }

export function SceneContent({
  mode,
  editTool,
  bookshelfRenderInstances,
  staticFixtureInstances,
  selections,
  onAddSelection,
  selectedBookshelfIndex,
  onSelectBookshelf,
  onUpdateBookshelf,
  showMapDiffLayer,
  showBookshelfOverlayLayer,
  forwardArrowRef,
  walkFov = WALK_DEFAULT_FOV,
  onWalkFovChange,
  onMinimapViewportUv,
  onPlayerPosition,
  playerWorldXzRef,
  navigationRoute,
}: {
  mode: ViewMode
  editTool: 'areaSelection' | 'bookshelfEdit'
  bookshelfRenderInstances: FixtureRenderInstance[]
  staticFixtureInstances: FixtureRenderInstance[]
  selections: CircleSelection[]
  onAddSelection: (point: PickPoint) => void
  selectedBookshelfIndex?: number | null
  onSelectBookshelf?: (index: number | null) => void
  onUpdateBookshelf?: (index: number, patch: Partial<FixtureRenderInstance>) => void
  showMapDiffLayer?: boolean
  showBookshelfOverlayLayer?: boolean
  forwardArrowRef?: RefObject<HTMLDivElement | null>
  walkFov?: number
  onWalkFovChange?: (fov: number) => void
  onMinimapViewportUv?: (quad: MinimapUvPoint[] | null) => void
  onPlayerPosition?: (pos: MinimapPlayerPos | null) => void
  playerWorldXzRef?: RefObject<Point2 | null>
  navigationRoute?: NavigationRouteVisual | null
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
  /** 저전시대(displayLow)는 바닥 밖에 떠 보이기 쉬워 1인칭에서만 표시. */
  const showDisplayLowFixtures = isFirstPerson
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const isBookshelfDraggingRef = useRef(false)
  const controlsEnabled = true
  const counterRenderInstances = useMemo(() => {
    const counters = staticFixtureInstances.filter((inst) => inst.kind === 'counter')
    if (!showBookshelfOverlayLayer) return counters
    return counters.filter((c) => !isCounterOverlaidByBookshelfOverlayLayer(c))
  }, [staticFixtureInstances, showBookshelfOverlayLayer])
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
  useWorldMovement(worldRef, yawRef, isWalkMode && controlsEnabled, {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: bookshelfCollisionRects,
  }, characterYawRef, walkMovingRef)

  /**
   * 워크/오버뷰 전환 시 월드·yaw/pitch 동기화.
   * R3F에서 `worldRef`가 첫 layout보다 늦게 붙을 수 있어, ref가 없으면 rAF로 재시도한다.
   * (ref 없이 early return만 하면 이후에도 같은 mode로 재실행되지 않아 1·3인칭 전환이 깨질 수 있음)
   */
  useEffect(() => {
    let raf = 0
    let attempts = 0
    const maxAttempts = 12

    const apply = () => {
      if (!worldRef.current) {
        attempts += 1
        if (attempts < maxAttempts) raf = requestAnimationFrame(apply)
        return
      }

      const isWalk = mode === 'firstPerson' || mode === 'thirdPerson'

      if (!isWalk) {
        storedWorldPositionRef.current = [worldRef.current.position.x, worldRef.current.position.z]
        worldRef.current.position.set(0, 0, 0)
        prevWalkModeRef.current = null
        return
      }

      worldRef.current.position.set(
        storedWorldPositionRef.current[0],
        0,
        storedWorldPositionRef.current[1],
      )

      const prev = prevWalkModeRef.current
      if (prev === null) {
        yawRef.current = MAP_VIEW_YAW_OFFSET_RAD
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      } else if (prev !== mode) {
        pitchRef.current = mode === 'firstPerson' ? FIRST_PERSON_DEFAULT_PITCH : THIRD_PERSON_LOCKED_PITCH
      }

      prevWalkModeRef.current = mode === 'firstPerson' || mode === 'thirdPerson' ? mode : null
    }

    apply()
    return () => cancelAnimationFrame(raf)
  }, [mode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
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
  }, [mode])

  const pickHandler = useCallback((surface: SurfaceKind) => (event: ThreeEvent<PointerEvent>) => {
    if (!event.altKey) return
    if (!worldRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onAddSelection({ x: localPoint.x, y: localPoint.y, z: localPoint.z, surface })
  }, [onAddSelection])

  const floorPickHandler = useMemo(() => isAreaSelection ? pickHandler('floor') : undefined, [isAreaSelection, pickHandler])
  const wallPickHandler = useMemo(() => isAreaSelection ? pickHandler('wall') : undefined, [isAreaSelection, pickHandler])
  const bookshelfPickHandler = useMemo(() => isAreaSelection ? pickHandler('bookshelf') : undefined, [isAreaSelection, pickHandler])
  const pillarPickHandler = useMemo(() => isAreaSelection ? pickHandler('pillar') : undefined, [isAreaSelection, pickHandler])

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
        <group userData={{ excludeCameraCollision: true }}>
          <MapDiffOverlayMesh visible={showMapDiffLayer ?? false} />
        </group>
        <group visible={showBookshelfOverlayLayer ?? false} userData={{ excludeCameraCollision: true }}>
          <BookshelfOverlayInterior
            instances={bookshelfOverlayLayerInstances}
            shellMaterial={bookshelfOverlayLayerMaterial}
            woodMaterial={bookshelfOverlayInteriorWoodMaterial}
          />
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
        {navigationRoute && <NavigationRouteMesh route={navigationRoute} />}
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
