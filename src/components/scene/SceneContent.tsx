import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { PerspectiveCamera } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { useEditDragController } from '../../hooks/useEditDragController'
import {
  wallRects as baseWallRects,
  pillarRects,
  floorRects,
  floorFillRects,
  FLOOR_HEIGHT_M,
} from '../../data/floorPlan'
import { axisAlignedBoundsForRotatedBookshelf } from '../../utils/bookshelfCollision'
import { useWorldMovement, INITIAL_PLAYER_POS } from '../../hooks/useWorldMovement'
import { bookshelfOverlayLayerInstances } from '../../data/bookshelfOverlayLayer'
import {
  FIRST_PERSON_DEFAULT_PITCH,
  FIRST_PERSON_EYE_HEIGHT_M,
  FIRST_PERSON_PITCH_MIN,
  FIRST_PERSON_PITCH_MAX,
  THIRD_PERSON_LOCKED_PITCH,
  MOUSE_LOOK_PITCH_MIN,
  MOUSE_LOOK_PITCH_MAX,
  floorMaterial,
  ceilingMaterial,
  bookshelfMaterial,
  bookshelfOverlayLayerMaterial,
  bookshelfOverlayInteriorWoodMaterial,
  counterMaterial,
  displayLowMaterial,
  pillarMaterial,
  markerMaterial,
  areaMaterial,
  FIXED_SELECTION_RADIUS_M,
  WALK_DEFAULT_FOV,
  MAP_VIEW_YAW_OFFSET_RAD,
} from '../../config/constants'
import type { ViewMode, SurfaceKind, PickPoint, CircleSelection, FixtureRenderInstance } from '../../types/scene'
import {
  WallRibbonMesh,
  FloorPolygonMesh,
  PillarCylinderInstances,
  RotatedFixtureInstances,
  SelectedBookshelfOverlay,
  BookstoreLights,
} from './Meshes'
import { MapDiffOverlayMesh } from './MapDiffOverlayMesh'
import { BookshelfOverlayInterior } from './BookshelfOverlayInterior'
import {
  CameraZoomController,
  OverviewZoomController,
  MouseLookController,
  FirstPersonCameraRig,
  ThirdPersonCameraRig,
  OverviewPanController,
} from './CameraControllers'
import { ThirdPersonOcclusionFader } from './ThirdPersonOcclusionFader'
import { StickmanPlayer } from './StickmanPlayer'
import { MinimapViewportReporter } from './MinimapViewportReporter'
import type { MinimapUvPoint } from './MinimapViewportReporter'
import { worldXzToMinimapUv } from '../../utils/minimapBounds'

export type MinimapPlayerPos = { u: number; v: number; yaw: number }

function PlayerPositionReporter({
  worldRef,
  characterYawRef,
  onPlayerPosition,
}: {
  worldRef: RefObject<Group | null>
  characterYawRef: RefObject<number>
  onPlayerPosition: (pos: MinimapPlayerPos | null) => void
}) {
  useFrame(() => {
    if (!worldRef.current) { onPlayerPosition(null); return }
    const wx = -worldRef.current.position.x
    const wz = -worldRef.current.position.z
    const { u, v } = worldXzToMinimapUv(wx, wz)
    onPlayerPosition({ u, v, yaw: characterYawRef.current })
  })
  return null
}

function ForwardArrowUpdater({
  yawRef,
  domRef,
}: {
  yawRef: RefObject<number>
  domRef: RefObject<HTMLDivElement | null>
}) {
  const { camera } = useThree()
  const camFwdVec = useRef(new Vector3())

  useFrame(() => {
    if (!domRef.current) return
    camera.getWorldDirection(camFwdVec.current)
    const fwd = camFwdVec.current
    const cameraYaw = Math.atan2(-fwd.x, -fwd.z)
    let delta = yawRef.current - cameraYaw
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    domRef.current.style.transform = `rotate(${delta}rad)`
  })

  return null
}

function EditDragController(props: {
  selectedIndex: number | null
  instances: FixtureRenderInstance[]
  onUpdate: (index: number, patch: Partial<FixtureRenderInstance>) => void
  suspend: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  useEditDragController(props)
  return null
}

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
  const counterRenderInstances = useMemo(
    () => staticFixtureInstances.filter((inst) => inst.kind === 'counter'),
    [staticFixtureInstances],
  )
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

  useEffect(() => {
    if (!worldRef.current) return

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

      {isFirstPerson ? (
        <>
          <PerspectiveCamera
            key="first-person-camera"
            makeDefault
            position={[0, FIRST_PERSON_EYE_HEIGHT_M, 0]}
            rotation={[0, 0, 0]}
            fov={walkFov}
          />
          <FirstPersonCameraRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
          />
          <CameraZoomController enabled={controlsEnabled} onFovChange={onWalkFovChange} />
          <MouseLookController
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
            isFreeLookRef={isFreeLookRef}
            mouseLookDraggingRef={mouseLookDraggingRef}
            pitchMin={FIRST_PERSON_PITCH_MIN}
            pitchMax={FIRST_PERSON_PITCH_MAX}
          />
          <StickmanPlayer characterYawRef={characterYawRef} worldRef={worldRef} visible={false} />
          {forwardArrowRef && <ForwardArrowUpdater yawRef={yawRef} domRef={forwardArrowRef} />}
        </>
      ) : isThirdPerson ? (
        <>
          <PerspectiveCamera
            key="third-person-camera"
            makeDefault
            position={[0, 2.6, 5.6]}
            rotation={[-0.86, 0, 0]}
            fov={WALK_DEFAULT_FOV}
          />
          <ThirdPersonCameraRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
          />
          <MouseLookController
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
            isFreeLookRef={isFreeLookRef}
            mouseLookDraggingRef={mouseLookDraggingRef}
            pitchMin={MOUSE_LOOK_PITCH_MIN}
            pitchMax={MOUSE_LOOK_PITCH_MAX}
          />
          <StickmanPlayer characterYawRef={characterYawRef} worldRef={worldRef} visible />
          {forwardArrowRef && <ForwardArrowUpdater yawRef={yawRef} domRef={forwardArrowRef} />}
        </>
      ) : (
        <>
          <PerspectiveCamera
            key="overview-camera"
            makeDefault
            position={[0, 50, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fov={64}
          />
          <OverviewZoomController />
          {!isEdit && controlsEnabled && <OverviewPanController />}
          {isEdit && (
            <>
              <OverviewPanController button={2} />
              <OverviewPanController button={0} requireSpaceKey />
            </>
          )}
          {onMinimapViewportUv && (
            <MinimapViewportReporter mode={mode} onMinimapViewportUv={onMinimapViewportUv} />
          )}
        </>
      )}

      {onPlayerPosition && (
        <PlayerPositionReporter
          worldRef={worldRef}
          characterYawRef={characterYawRef}
          onPlayerPosition={onPlayerPosition}
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
        </group>
        <WallRibbonMesh
          onPointerDown={wallPickHandler}
        />
        <RotatedFixtureInstances
          instances={bookshelfRenderInstances}
          material={bookshelfMaterial}
          onPointerDown={
            isBookshelfEdit
              ? handleBookshelfPointerDown
              : bookshelfPickHandler
          }
        />
        <RotatedFixtureInstances
          instances={counterRenderInstances}
          material={counterMaterial}
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
