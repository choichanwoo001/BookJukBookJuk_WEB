import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PerspectiveCamera } from '@react-three/drei'
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
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
  THIRD_PERSON_LOCKED_PITCH,
  floorMaterial,
  bookshelfMaterial,
  bookshelfOverlayLayerMaterial,
  counterMaterial,
  displayLowMaterial,
  pillarMaterial,
  markerMaterial,
  areaMaterial,
  FIXED_SELECTION_RADIUS_M,
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
import {
  CameraZoomController,
  OverviewZoomController,
  MouseLookController,
  ThirdPersonCameraRig,
  OverviewPanController,
} from './CameraControllers'
import { StickmanPlayer } from './StickmanPlayer'
const EDIT_YAW_DRAG_SENSITIVITY = 0.008
const EDIT_YAW_WHEEL_SENSITIVITY = 0.0025
function EditDragController({
  selectedIndex,
  instances,
  onUpdate,
  onDeselect,
  suspend,
  onDragStart,
  onDragEnd,
}: {
  selectedIndex: number | null
  instances: FixtureRenderInstance[]
  onUpdate: (index: number, patch: Partial<FixtureRenderInstance>) => void
  onDeselect: () => void
  suspend: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const { camera, gl } = useThree()
  const isDragging = useRef(false)
  const isShiftDrag = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const groundPlane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const raycaster = useRef(new Raycaster())
  const ndc = useRef(new Vector2())
  const dragOffset = useRef(new Vector3())
  const selectedRef = useRef(selectedIndex)
  const instancesRef = useRef(instances)
  useEffect(() => {
    selectedRef.current = selectedIndex
    instancesRef.current = instances
  }, [selectedIndex, instances])

  const screenToGround = useCallback((clientX: number, clientY: number): Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect()
    ndc.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.current.setFromCamera(ndc.current, camera)
    const target = new Vector3()
    const hit = raycaster.current.ray.intersectPlane(groundPlane.current, target)
    return hit
  }, [camera, gl])

  useEffect(() => {
    const el = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if (suspend) return
      if (e.button !== 0) return
      if (e.altKey) return
      const idx = selectedRef.current
      if (idx === null) return

      const inst = instancesRef.current[idx]
      if (!inst) return

      const ground = screenToGround(e.clientX, e.clientY)
      if (!ground) return

      if (e.shiftKey) {
        isShiftDrag.current = true
        isDragging.current = true
        onDragStart?.()
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        el.setPointerCapture(e.pointerId)
        e.preventDefault()
        return
      }

      const dist = Math.sqrt((ground.x - inst.cx) ** 2 + (ground.z - inst.cz) ** 2)
      const maxGrab = Math.max(inst.w, inst.d) * 0.8
      if (dist > maxGrab) {
        onDeselect()
        return
      }

      dragOffset.current.set(inst.cx - ground.x, 0, inst.cz - ground.z)
      isDragging.current = true
      isShiftDrag.current = false
      onDragStart?.()
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      const idx = selectedRef.current
      if (idx === null) return

      if (isShiftDrag.current) {
        const dx = e.clientX - lastMousePos.current.x
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        onUpdate(idx, { yaw: instancesRef.current[idx].yaw + dx * EDIT_YAW_DRAG_SENSITIVITY })
        return
      }

      const ground = screenToGround(e.clientX, e.clientY)
      if (!ground) return
      onUpdate(idx, {
        cx: ground.x + dragOffset.current.x,
        cz: ground.z + dragOffset.current.z,
      })
    }

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging.current) {
        isDragging.current = false
        isShiftDrag.current = false
        onDragEnd?.()
        el.releasePointerCapture(e.pointerId)
      }
    }

    const onWheel = (e: WheelEvent) => {
      const idx = selectedRef.current
      if (idx === null) return
      e.preventDefault()
      const dominantDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (dominantDelta === 0) return
      onUpdate(idx, {
        yaw: instancesRef.current[idx].yaw + dominantDelta * EDIT_YAW_WHEEL_SENSITIVITY,
      })
    }

    const onContextMenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContextMenu)
    }
  }, [gl, screenToGround, onUpdate, onDeselect, suspend, onDragStart, onDragEnd])

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
}) {
  const worldRef = useRef<Group>(null)
  const storedWorldPositionRef = useRef<[number, number]>([-INITIAL_PLAYER_POS[0], -INITIAL_PLAYER_POS[1]])
  const yawRef = useRef(0)
  const pitchRef = useRef(THIRD_PERSON_LOCKED_PITCH)
  const characterYawRef = useRef(0)
  const isFreeLookRef = useRef(false)
  const isThirdPerson = mode === 'thirdPerson'
  const isEdit = mode === 'edit'
  const isBookshelfEdit = isEdit && editTool === 'bookshelfEdit'
  const isAreaSelection = isEdit && editTool === 'areaSelection'
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
  useWorldMovement(worldRef, yawRef, isThirdPerson && controlsEnabled, {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: bookshelfCollisionRects,
  }, characterYawRef)

  useEffect(() => {
    if (!worldRef.current) return

    if (!isThirdPerson) {
      storedWorldPositionRef.current = [worldRef.current.position.x, worldRef.current.position.z]
      worldRef.current.position.set(0, 0, 0)
      return
    }

    worldRef.current.position.set(
      storedWorldPositionRef.current[0],
      0,
      storedWorldPositionRef.current[1],
    )
    yawRef.current = 0
    pitchRef.current = THIRD_PERSON_LOCKED_PITCH
  }, [isThirdPerson])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      setIsSpacePressed(true)
      isFreeLookRef.current = false
      yawRef.current = characterYawRef.current
      pitchRef.current = THIRD_PERSON_LOCKED_PITCH
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
  }, [])

  const createPickHandler = (surface: SurfaceKind) => (event: ThreeEvent<PointerEvent>) => {
    if (!event.altKey) return
    if (!worldRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onAddSelection({
      x: localPoint.x,
      y: localPoint.y,
      z: localPoint.z,
      surface,
    })
  }

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

  const clearBookshelfSelection = useCallback(() => {
    onSelectBookshelf?.(null)
  }, [onSelectBookshelf])

  const handleDeselect = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (event.altKey) return
    onSelectBookshelf?.(null)
  }, [onSelectBookshelf])

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

      {isThirdPerson ? (
        <>
          <PerspectiveCamera
            key="third-person-camera"
            makeDefault
            position={[0, 2.6, 5.6]}
            rotation={[-0.86, 0, 0]}
            fov={64}
          />
          <ThirdPersonCameraRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
            characterYawRef={characterYawRef}
            isFreeLookRef={isFreeLookRef}
          />
          <CameraZoomController enabled={controlsEnabled} />
          <MouseLookController
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled}
            isFreeLookRef={isFreeLookRef}
          />
          <StickmanPlayer characterYawRef={characterYawRef} worldRef={worldRef} />
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
        </>
      )}

      {isBookshelfEdit && onUpdateBookshelf && (
        <EditDragController
          selectedIndex={selectedBookshelfIndex ?? null}
          instances={bookshelfRenderInstances}
          onUpdate={onUpdateBookshelf}
          onDeselect={clearBookshelfSelection}
          suspend={isSpacePressed}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}

      <group ref={worldRef}>
        <FloorPolygonMesh
          yOffset={0}
          material={floorMaterial}
          fillRects={floorFillRects}
          onClick={isBookshelfEdit ? handleDeselect : undefined}
          onPointerDown={isAreaSelection ? createPickHandler('floor') : undefined}
        />
        <MapDiffOverlayMesh visible={showMapDiffLayer ?? false} />
        <group visible={showBookshelfOverlayLayer ?? false}>
          <RotatedFixtureInstances
            instances={bookshelfOverlayLayerInstances}
            material={bookshelfOverlayLayerMaterial}
          />
        </group>
        <WallRibbonMesh
          onClick={isBookshelfEdit ? handleDeselect : undefined}
          onPointerDown={isAreaSelection ? createPickHandler('wall') : undefined}
        />
        <RotatedFixtureInstances
          instances={bookshelfRenderInstances}
          material={bookshelfMaterial}
          onPointerDown={
            isBookshelfEdit
              ? handleBookshelfPointerDown
              : isAreaSelection
                ? createPickHandler('bookshelf')
                : undefined
          }
        />
        <RotatedFixtureInstances
          instances={counterRenderInstances}
          material={counterMaterial}
          onClick={isBookshelfEdit ? handleDeselect : undefined}
          onPointerDown={isAreaSelection ? createPickHandler('bookshelf') : undefined}
        />
        <RotatedFixtureInstances
          instances={displayRenderInstances}
          material={displayLowMaterial}
          onClick={isBookshelfEdit ? handleDeselect : undefined}
          onPointerDown={isAreaSelection ? createPickHandler('bookshelf') : undefined}
        />
        {isBookshelfEdit && selectedInst && (
          <SelectedBookshelfOverlay instance={selectedInst} />
        )}
        <PillarCylinderInstances
          rects={pillarRects}
          height={FLOOR_HEIGHT_M}
          yOffset={0}
          material={pillarMaterial}
          onClick={isBookshelfEdit ? handleDeselect : undefined}
          onPointerDown={isAreaSelection ? createPickHandler('pillar') : undefined}
        />
        <BookstoreLights floorRenderRects={floorRects} />
        {selections.map((selection) => (
          <group key={selection.id}>
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
