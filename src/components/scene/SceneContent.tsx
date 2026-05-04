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
  bookshelfPolygons,
  BOOKSHELF_POLYGON_RENDER_IDS,
  bookshelfPolygonByShelfId,
  FLOOR_HEIGHT_M,
} from '../../data/floorPlan'
import { axisAlignedBoundsForRotatedBookshelf } from '../../utils/bookshelfCollision'
import { findNearestBookshelfIndexAtXZ } from '../../utils/bookshelfSelection'
import { useWorldMovement, INITIAL_PLAYER_POS } from '../../hooks/useWorldMovement'
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
  displayLowMaterial,
  pillarMaterial,
  markerMaterial,
  areaMaterial,
  FIXED_SELECTION_RADIUS_M,
  WALK_DEFAULT_FOV,
  THIRD_PERSON_PLAYER_SCALE_MULT,
  MAP_VIEW_YAW_OFFSET_RAD,
  SHOW_NAVIGATION_ROUTE_VISUAL,
} from '../../config/constants'
import type { ViewMode, SurfaceKind, PickPoint, CircleSelection, FixtureRenderInstance } from '../../types/scene'
import type { Point2 } from '../../data/floorPlan'
import {
  WallRibbonMesh,
  FloorPolygonMesh,
  PillarCylinderInstances,
  RotatedFixtureInstances,
  BookshelfPolygonInstances,
  SupermarketCounterInstances,
  SelectedBookshelfOverlay,
  BookstoreLights,
} from './Meshes'
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
import { NavigationRouteMesh } from './NavigationRouteMesh'
import type { NavigationRouteVisual } from '../../hooks/useNavigationRoute'

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
  const lastEmitRef = useRef(0)
  const lastSentRef = useRef<MinimapPlayerPos | null>(null)
  useFrame((state) => {
    if (!worldRef.current) {
      if (lastSentRef.current !== null) {
        lastSentRef.current = null
        onPlayerPosition(null)
      }
      return
    }
    const wx = -worldRef.current.position.x
    const wz = -worldRef.current.position.z
    const { u, v } = worldXzToMinimapUv(wx, wz)
    const yaw = characterYawRef.current
    const t = state.clock.elapsedTime
    const next: MinimapPlayerPos = { u, v, yaw }
    const prev = lastSentRef.current
    const moved =
      !prev
      || Math.abs(prev.u - u) > 0.0008
      || Math.abs(prev.v - v) > 0.0008
      || Math.abs(prev.yaw - yaw) > 0.02
    if (!moved && t - lastEmitRef.current < 0.12) return
    lastEmitRef.current = t
    lastSentRef.current = next
    onPlayerPosition(next)
  })
  return null
}

function PlayerWorldXzReporter({
  worldRef,
  storedWorldPositionRef,
  isWalkMode,
  playerWorldXzRef,
}: {
  worldRef: RefObject<Group | null>
  storedWorldPositionRef: RefObject<[number, number]>
  isWalkMode: boolean
  playerWorldXzRef: RefObject<Point2 | null>
}) {
  useFrame(() => {
    if (isWalkMode && worldRef.current) {
      playerWorldXzRef.current = [-worldRef.current.position.x, -worldRef.current.position.z]
    } else {
      playerWorldXzRef.current = [-storedWorldPositionRef.current[0], -storedWorldPositionRef.current[1]]
    }
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
  bookshelfSectorValues,
  deltaBookshelfRenderInstances,
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
}: {
  mode: ViewMode
  editTool: 'areaSelection' | 'bookshelfEdit'
  bookshelfRenderInstances: FixtureRenderInstance[]
  bookshelfSectorValues?: readonly (number | null | undefined)[]
  deltaBookshelfRenderInstances: FixtureRenderInstance[]
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
    return staticFixtureInstances.filter((inst) => inst.kind === 'counter')
  }, [staticFixtureInstances])
  const displayRenderInstances = useMemo(
    () => staticFixtureInstances.filter((inst) => inst.kind === 'displayLow'),
    [staticFixtureInstances],
  )

  /** ㄱ/ㄴ형 등 맵 폴리곤으로만 그릴 shelf id (나머지는 OBB). */
  const specialBookshelfRenderPolygons = useMemo(() => {
    const out: Point2[][] = []
    for (const id of BOOKSHELF_POLYGON_RENDER_IDS) {
      const p = bookshelfPolygonByShelfId[id]
      if (p && p.length >= 3) out.push(p)
    }
    return out
  }, [])

  /** 폴리곤 메쉬가 있는 특수 책장은 OBB를 투명 처리하고 피킹만 유지 */
  const transparentBookshelfInstanceIndices = useMemo(() => {
    const ids = BOOKSHELF_POLYGON_RENDER_IDS as readonly string[]
    const s = new Set<number>()
    bookshelfRenderInstances.forEach((inst, i) => {
      if (inst.kind !== 'bookshelf' || !inst.shelfId) return
      if (!ids.includes(inst.shelfId)) return
      if (bookshelfPolygonByShelfId[inst.shelfId]) s.add(i)
    })
    return s
  }, [bookshelfRenderInstances])

  const bookshelfCollisionRects = useMemo(
    () =>
      bookshelfRenderInstances.map(inst =>
        axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw),
      ),
    [bookshelfRenderInstances],
  )
  const deltaBookshelfCollisionRects = useMemo(
    () =>
      deltaBookshelfRenderInstances.map(inst =>
        axisAlignedBoundsForRotatedBookshelf(inst.cx, inst.cz, inst.w, inst.d, inst.yaw),
      ),
    [deltaBookshelfRenderInstances],
  )
  useWorldMovement(worldRef, yawRef, isWalkMode && controlsEnabled, {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: [...bookshelfCollisionRects, ...deltaBookshelfCollisionRects],
    bookshelfPolygons,
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

  /** 폴리곤 병합 책장: instanceId 없음 → 클릭 지점 xz로 가장 가까운 책장 선택 */
  const handleBookshelfPolygonEditPointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!isBookshelfEdit || !onSelectBookshelf) return
    if (!event.altKey) return
    if (!worldRef.current) return
    if (isBookshelfDraggingRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const local = worldRef.current.worldToLocal(event.point.clone())
    const idx = findNearestBookshelfIndexAtXZ(local.x, local.z, bookshelfRenderInstances)
    if (idx !== null) onSelectBookshelf(idx)
  }, [isBookshelfEdit, onSelectBookshelf, bookshelfRenderInstances])

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
            fov={walkFov}
          />
          <ThirdPersonCameraRig
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
            pitchMin={MOUSE_LOOK_PITCH_MIN}
            pitchMax={MOUSE_LOOK_PITCH_MAX}
            applyRotationToCamera={false}
          />
          <StickmanPlayer
            characterYawRef={characterYawRef}
            worldRef={worldRef}
            visible
            scaleMultiplier={THIRD_PERSON_PLAYER_SCALE_MULT}
          />
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
        <WallRibbonMesh
          onPointerDown={wallPickHandler}
        />
        {specialBookshelfRenderPolygons.length > 0 && (
          <BookshelfPolygonInstances
            polygons={specialBookshelfRenderPolygons}
            height={FLOOR_HEIGHT_M * 0.78}
            material={bookshelfMaterial}
            onPointerDown={
              isBookshelfEdit ? handleBookshelfPolygonEditPointerDown : bookshelfPickHandler
            }
          />
        )}
        <RotatedFixtureInstances
          instances={bookshelfRenderInstances}
          sectorValues={bookshelfSectorValues}
          material={bookshelfMaterial}
          tintSectors={isBookshelfEdit}
          transparentInstanceIndices={transparentBookshelfInstanceIndices}
          onPointerDown={
            isBookshelfEdit
              ? handleBookshelfPointerDown
              : bookshelfPickHandler
          }
        />
        <RotatedFixtureInstances
          instances={deltaBookshelfRenderInstances}
          material={bookshelfMaterial}
          onPointerDown={bookshelfPickHandler}
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
        {SHOW_NAVIGATION_ROUTE_VISUAL && navigationRoute && (
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
