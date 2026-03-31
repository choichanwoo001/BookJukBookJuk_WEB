import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  Path,
  ShapeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import type { InstancedMesh as ThreeInstancedMesh } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import {
  wallPolylines,
  wallHolePolylines,
  wallRects as baseWallRects,
  bookshelfRects as baseBookshelfRects,
  bookshelfInstances,
  pillarRects,
  floorRects,
  floorFillRects,
  FLOOR_HEIGHT_M,
  type WallRect,
} from '../data/floorPlan'
import { useWorldMovement } from '../hooks/useWorldMovement'

type ViewMode = 'thirdPerson' | 'overview'
type SurfaceKind = 'floor' | 'wall' | 'bookshelf' | 'pillar'

type PickPoint = {
  x: number
  y: number
  z: number
  surface: SurfaceKind
}

type CircleSelection = {
  id: string
  center: PickPoint
}

const wallMaterial = new MeshStandardMaterial({ color: '#F5F0E8', roughness: 0.92, metalness: 0.0, side: 2 }) // DoubleSide
const bookshelfMaterial = new MeshStandardMaterial({ color: '#8E5C42', roughness: 0.78, metalness: 0.02, side: 2 })
const pillarMaterial = new MeshStandardMaterial({ color: '#D9D0C3', roughness: 0.86, metalness: 0.0, side: 2 })
const floorMaterial = new MeshStandardMaterial({ color: '#B5885A', roughness: 0.85, metalness: 0.02, side: 2 })
const SURFACE_WALL_OVERLAP_M = 0.04
const FIXED_SELECTION_RADIUS_M = 0.35
const markerMaterial = new MeshStandardMaterial({ color: '#58D68D', emissive: '#1f6f4a', emissiveIntensity: 0.35 })
const areaMaterial = new MeshStandardMaterial({ color: '#58D68D', transparent: true, opacity: 0.28 })
const playerMaterial = new MeshStandardMaterial({ color: '#2B2B2B', roughness: 0.85, metalness: 0.0 })
const THIRD_PERSON_DISTANCE_M = 6.2
const THIRD_PERSON_TARGET_HEIGHT_M = 1.0
const THIRD_PERSON_LOOK_AHEAD_M = 1.35
const THIRD_PERSON_MIN_CAMERA_Y_M = 2.15
const THIRD_PERSON_MAX_CAMERA_Y_M = FLOOR_HEIGHT_M - 0.22
const THIRD_PERSON_LOCKED_PITCH = -0.72

type FixtureRenderInstance = {
  cx: number
  cz: number
  w: number
  d: number
  yaw: number
  h: number
}

const DEFAULT_BOOKSHELF_SIZE = { w: 1.8, d: 0.85, h: FLOOR_HEIGHT_M * 0.78 }

function WallRibbonMesh({
  onDoubleClick,
}: {
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const wallGeometry = useMemo(() => {
    const yBottom = -SURFACE_WALL_OVERLAP_M
    const yTop = FLOOR_HEIGHT_M + SURFACE_WALL_OVERLAP_M
    const positions: number[] = []
    const indices: number[] = []

    for (const loop of wallPolylines) {
      if (loop.length < 2) continue
      const base = positions.length / 3
      for (const [x, z] of loop) {
        positions.push(x, yBottom, z)
        positions.push(x, yTop, z)
      }
      const n = loop.length
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const b0 = base + i * 2
        const t0 = base + i * 2 + 1
        const b1 = base + next * 2
        const t1 = base + next * 2 + 1
        indices.push(b0, b1, t1, b0, t1, t0)
      }
    }

    const geo = new BufferGeometry()
    if (positions.length === 0) {
      geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
      return geo
    }
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  return <mesh geometry={wallGeometry} material={wallMaterial} frustumCulled={false} onDoubleClick={onDoubleClick} />
}

function signedArea2D(pts: [number, number][]) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area * 0.5
}

function FloorPolygonMesh({
  yOffset,
  material,
  fillRects,
  onDoubleClick,
}: {
  yOffset: number
  material: MeshStandardMaterial
  fillRects?: WallRect[]
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const geometry = useMemo(() => {
    if (wallPolylines.length === 0) return new BufferGeometry()

    let outerIdx = 0
    let outerAbsArea = 0
    for (let i = 0; i < wallPolylines.length; i++) {
      const a = Math.abs(signedArea2D(wallPolylines[i]))
      if (a > outerAbsArea) { outerAbsArea = a; outerIdx = i }
    }

    const outerPts = wallPolylines[outerIdx]
    const shape = new Shape()
    shape.moveTo(outerPts[0][0], outerPts[0][1])
    for (let i = 1; i < outerPts.length; i++) {
      shape.lineTo(outerPts[i][0], outerPts[i][1])
    }
    shape.closePath()

    for (const holePts of wallHolePolylines) {
      if (holePts.length < 3) continue
      const hole = new Path()
      hole.moveTo(holePts[0][0], holePts[0][1])
      for (let j = 1; j < holePts.length; j++) {
        hole.lineTo(holePts[j][0], holePts[j][1])
      }
      hole.closePath()
      shape.holes.push(hole)
    }

    const shapeGeo = new ShapeGeometry(shape)
    const pos = shapeGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getY(i)
      pos.setXYZ(i, x, yOffset, z)
    }
    pos.needsUpdate = true
    shapeGeo.computeVertexNormals()

    if (!fillRects || fillRects.length === 0) return shapeGeo

    const fillGeos = fillRects.map(r => {
      const g = new PlaneGeometry(r.w, r.d)
      g.rotateX(-Math.PI / 2)
      g.translate(r.cx, yOffset, r.cz)
      return g
    })
    return mergeGeometries([shapeGeo, ...fillGeos]) ?? shapeGeo
  }, [yOffset, fillRects])

  return <mesh geometry={geometry} material={material} frustumCulled={false} onDoubleClick={onDoubleClick} />
}

function PillarCylinderInstances({
  rects,
  height,
  yOffset,
  material,
  onDoubleClick,
}: {
  rects: WallRect[]
  height: number
  yOffset: number
  material: MeshStandardMaterial
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])
  const geometry = useMemo(() => new CylinderGeometry(0.5, 0.5, 1, 16), [])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const radius = Math.min(r.w, r.d)
      matrix.makeScale(radius, height, radius)
      matrix.setPosition(r.cx, yOffset + height * 0.5, r.cz)
      meshRef.current.setMatrixAt(i, matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [height, matrix, rects, yOffset, geometry])

  if (rects.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, rects.length]}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
    >
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

function RotatedFixtureInstances({
  instances,
  material,
  onDoubleClick,
}: {
  instances: FixtureRenderInstance[]
  material: MeshStandardMaterial
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const meshRef = useRef<ThreeInstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])

  useEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < instances.length; i++) {
      const s = instances[i]
      matrix.makeRotationY(s.yaw)
      const scale = new Matrix4().makeScale(s.w, s.h, s.d)
      matrix.multiply(scale)
      matrix.setPosition(s.cx, s.h * 0.5, s.cz)
      meshRef.current.setMatrixAt(i, matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [instances, matrix])

  if (instances.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instances.length]}
      frustumCulled={false}
      onDoubleClick={onDoubleClick}
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}

function BookstoreLights({ floorRenderRects }: { floorRenderRects: WallRect[] }) {
  const positions = useMemo(() => {
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const r of floorRenderRects) {
      minX = Math.min(minX, r.cx - r.w / 2)
      maxX = Math.max(maxX, r.cx + r.w / 2)
      minZ = Math.min(minZ, r.cz - r.d / 2)
      maxZ = Math.max(maxZ, r.cz + r.d / 2)
    }

    const result: [number, number, number][] = []
    const spacing = 10
    const y = FLOOR_HEIGHT_M - 0.5
    for (let x = minX + spacing / 2; x <= maxX; x += spacing) {
      for (let z = minZ + spacing / 2; z <= maxZ; z += spacing) {
        const hasFloor = floorRenderRects.some(r =>
          x >= r.cx - r.w / 2 && x <= r.cx + r.w / 2 &&
          z >= r.cz - r.d / 2 && z <= r.cz + r.d / 2,
        )
        if (hasFloor) result.push([x, y, z])
      }
    }
    return result
  }, [floorRenderRects])

  return (
    <>
      {positions.map((pos, i) => (
        <pointLight
          key={i}
          position={pos}
          color="#FFE0B2"
          intensity={2.5}
          distance={14}
          decay={2}
        />
      ))}
    </>
  )
}

function CameraZoomController({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    const minFov = 42
    const maxFov = 62
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera

    const onWheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      const delta = event.deltaY * 0.02
      perspectiveCamera.fov = Math.min(maxFov, Math.max(minFov, perspectiveCamera.fov + delta))
      perspectiveCamera.updateProjectionMatrix()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [camera, enabled, gl])

  return null
}

function OverviewZoomController() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * 0.05
      perspectiveCamera.position.y = Math.min(120, Math.max(10, perspectiveCamera.position.y + delta))
      perspectiveCamera.updateProjectionMatrix()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [camera, gl])

  return null
}

function MouseLookController({
  yawRef,
  pitchRef,
  enabled,
}: {
  yawRef: RefObject<number>
  pitchRef: RefObject<number>
  enabled: boolean
}) {
  const { camera, gl } = useThree()

  useEffect(() => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    if (!enabled) return
    const perspectiveCamera = camera as ThreePerspectiveCamera
    const element = gl.domElement
    const lookSensitivity = 0.0032
    const minPitch = -1.2
    const maxPitch = -0.56
    let isDragging = false
    let lastX = 0
    let lastY = 0

    const applyCameraRotation = () => {
      perspectiveCamera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!enabled || event.button !== 0) return
      event.preventDefault()
      isDragging = true
      lastX = event.clientX
      lastY = event.clientY
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      yawRef.current -= dx * lookSensitivity
      pitchRef.current = Math.max(minPitch, Math.min(maxPitch, pitchRef.current - dy * lookSensitivity))
      applyCameraRotation()
    }

    const stopDragging = () => {
      isDragging = false
    }

    applyCameraRotation()
    element.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('mouseleave', stopDragging)
    return () => {
      element.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('mouseleave', stopDragging)
    }
  }, [camera, enabled, gl, pitchRef, yawRef])

  return null
}

function ThirdPersonCameraRig({
  yawRef,
  pitchRef,
  enabled,
  lockForwardView,
}: {
  yawRef: RefObject<number>
  pitchRef: RefObject<number>
  enabled: boolean
  lockForwardView: boolean
}) {
  const { camera } = useThree()
  const desiredPositionRef = useRef(new Vector3())
  const lookTargetRef = useRef(new Vector3(0, THIRD_PERSON_TARGET_HEIGHT_M, 0))

  useFrame((_, delta) => {
    if (!enabled) return
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    if (lockForwardView) {
      const lockBlend = 1 - Math.exp(-delta * 14)
      pitchRef.current += (THIRD_PERSON_LOCKED_PITCH - pitchRef.current) * lockBlend
    }

    const desiredPosition = desiredPositionRef.current
    const yaw = yawRef.current
    const pitch = pitchRef.current
    const cosPitch = Math.cos(pitch)

    desiredPosition.set(
      -Math.sin(yaw) * cosPitch,
      -Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    ).multiplyScalar(THIRD_PERSON_DISTANCE_M)
    desiredPosition.y += THIRD_PERSON_TARGET_HEIGHT_M
    desiredPosition.y = Math.min(THIRD_PERSON_MAX_CAMERA_Y_M, Math.max(THIRD_PERSON_MIN_CAMERA_Y_M, desiredPosition.y))

    lookTargetRef.current.set(
      Math.sin(yaw) * THIRD_PERSON_LOOK_AHEAD_M,
      THIRD_PERSON_TARGET_HEIGHT_M,
      -Math.cos(yaw) * THIRD_PERSON_LOOK_AHEAD_M,
    )

    const lerpAlpha = 1 - Math.exp(-delta * 10)
    camera.position.lerp(desiredPosition, lerpAlpha)
    camera.lookAt(lookTargetRef.current)
  })

  return null
}

function StickmanPlayer({
  yawRef,
  worldRef,
}: {
  yawRef: RefObject<number>
  worldRef: RefObject<Group | null>
}) {
  const avatarRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const previousWorldPosRef = useRef<Vector3 | null>(null)
  const gaitPhaseRef = useRef(0)
  const gaitBlendRef = useRef(0)

  useFrame((_, delta) => {
    if (!avatarRef.current) return
    avatarRef.current.rotation.y = yawRef.current

    if (!worldRef.current) return

    const worldPos = worldRef.current.position
    const prevWorldPos = previousWorldPosRef.current
    let speed = 0
    if (prevWorldPos) {
      const dx = worldPos.x - prevWorldPos.x
      const dz = worldPos.z - prevWorldPos.z
      speed = Math.hypot(dx, dz) / Math.max(delta, 1e-4)
    }

    if (!prevWorldPos) {
      previousWorldPosRef.current = worldPos.clone()
    } else {
      prevWorldPos.copy(worldPos)
    }

    const isMoving = speed > 0.03
    const blendTarget = isMoving ? 1 : 0
    const blendLerp = 1 - Math.exp(-delta * 12)
    gaitBlendRef.current += (blendTarget - gaitBlendRef.current) * blendLerp

    const gaitSpeed = 4 + Math.min(speed * 1.8, 8)
    gaitPhaseRef.current += delta * gaitSpeed

    const swing = Math.sin(gaitPhaseRef.current) * 0.52 * gaitBlendRef.current
    const bob = Math.abs(Math.sin(gaitPhaseRef.current * 2)) * 0.035 * gaitBlendRef.current

    if (leftArmRef.current) leftArmRef.current.rotation.x = swing
    if (rightArmRef.current) rightArmRef.current.rotation.x = -swing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -swing * 0.8
    if (rightLegRef.current) rightLegRef.current.rotation.x = swing * 0.8
    if (bodyRef.current) bodyRef.current.position.y = bob
  })

  return (
    <group ref={avatarRef} position={[0, 0, 0]} scale={[0.7, 0.7, 0.7]}>
      <group ref={bodyRef}>
        <mesh position={[0, 1.52, 0]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <primitive object={playerMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 1.06, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.58, 12]} />
          <primitive object={playerMaterial} attach="material" />
        </mesh>
        <group ref={leftArmRef} position={[-0.18, 1.16, 0]}>
          <mesh position={[0, -0.2, 0]} rotation={[0, 0, Math.PI / 2.9]}>
            <cylinderGeometry args={[0.028, 0.028, 0.48, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.18, 1.16, 0]}>
          <mesh position={[0, -0.2, 0]} rotation={[0, 0, -Math.PI / 2.9]}>
            <cylinderGeometry args={[0.028, 0.028, 0.48, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={leftLegRef} position={[-0.08, 0.8, 0]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.08, 0.8, 0]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 10]} />
            <primitive object={playerMaterial} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function OverviewPanController() {
  const { camera, gl } = useThree()

  useEffect(() => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera
    const element = gl.domElement
    let isDragging = false
    let lastX = 0
    let lastY = 0

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      isDragging = true
      lastX = event.clientX
      lastY = event.clientY
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      const panSpeed = perspectiveCamera.position.y * 0.002
      perspectiveCamera.position.x -= dx * panSpeed
      perspectiveCamera.position.z -= dy * panSpeed
    }

    const stopDragging = () => {
      isDragging = false
    }

    element.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('mouseleave', stopDragging)
    return () => {
      element.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('mouseleave', stopDragging)
    }
  }, [camera, gl])

  return null
}

function SceneContent({
  mode,
  bookshelfRenderInstances,
  selections,
  onAddSelection,
}: {
  mode: ViewMode
  bookshelfRenderInstances: FixtureRenderInstance[]
  selections: CircleSelection[]
  onAddSelection: (point: PickPoint) => void
}) {
  const worldRef = useRef<Group>(null)
  const storedWorldPositionRef = useRef<[number, number]>([0.919, -2.056])
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.72)
  const [isForwardViewLocked, setIsForwardViewLocked] = useState(false)
  const isThirdPerson = mode === 'thirdPerson'
  const controlsEnabled = true
  useWorldMovement(worldRef, yawRef, isThirdPerson && controlsEnabled, {
    floorRects,
    wallRects: baseWallRects,
    bookshelfRects: baseBookshelfRects,
  })

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
    pitchRef.current = -0.72
  }, [isThirdPerson])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      setIsForwardViewLocked(true)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      setIsForwardViewLocked(false)
    }

    const handleWindowBlur = () => {
      setIsForwardViewLocked(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  const createPickHandler = (surface: SurfaceKind) => (event: ThreeEvent<MouseEvent>) => {
    if (!worldRef.current) return
    event.stopPropagation()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onAddSelection({
      x: localPoint.x,
      y: localPoint.y,
      z: localPoint.z,
      surface,
    })
  }

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
            lockForwardView={isForwardViewLocked}
          />
          <CameraZoomController enabled={controlsEnabled} />
          <MouseLookController
            yawRef={yawRef}
            pitchRef={pitchRef}
            enabled={controlsEnabled && !isForwardViewLocked}
          />
          <StickmanPlayer yawRef={yawRef} worldRef={worldRef} />
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
          {controlsEnabled && <OverviewPanController />}
        </>
      )}

      <group ref={worldRef}>
        <FloorPolygonMesh yOffset={0} material={floorMaterial} fillRects={floorFillRects} onDoubleClick={createPickHandler('floor')} />
        <WallRibbonMesh onDoubleClick={createPickHandler('wall')} />
        <RotatedFixtureInstances
          instances={bookshelfRenderInstances}
          material={bookshelfMaterial}
          onDoubleClick={createPickHandler('bookshelf')}
        />
        <PillarCylinderInstances
          rects={pillarRects}
          height={FLOOR_HEIGHT_M}
          yOffset={0}
          material={pillarMaterial}
          onDoubleClick={createPickHandler('pillar')}
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

function formatCoord(value: number) {
  return value.toFixed(3)
}

function selectionToText(selection: CircleSelection) {
  return [
    'circle-area',
    `surface=${selection.center.surface}`,
    `center=(x=${formatCoord(selection.center.x)}, y=${formatCoord(selection.center.y)}, z=${formatCoord(selection.center.z)})`,
    `radius=${formatCoord(FIXED_SELECTION_RADIUS_M)}`,
  ].join(' | ')
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [selections, setSelections] = useState<CircleSelection[]>([])
  const bookshelfRenderInstances = useMemo<FixtureRenderInstance[]>(() => {
    return bookshelfInstances.map<FixtureRenderInstance>(item => ({
      cx: item.cx,
      cz: item.cz,
      w: item.w,
      d: item.d,
      yaw: item.yaw,
      h: DEFAULT_BOOKSHELF_SIZE.h,
    }))
  }, [])

  const handleAddSelection = (point: PickPoint) => {
    setSelections((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        center: point,
      },
    ])
  }

  useEffect(() => {
    if (selections.length === 0) return
    const text = selections.map(selectionToText).join('\n')
    navigator.clipboard.writeText(text).catch(() => {
      // Ignore clipboard permission/runtime errors.
    })
  }, [selections])

  return (
    <div className="map3DContainer">
      <Canvas dpr={[1, 2]}>
        <SceneContent
          mode={mode}
          bookshelfRenderInstances={bookshelfRenderInstances}
          selections={selections}
          onAddSelection={handleAddSelection}
        />
      </Canvas>
      <div className="mapViewButtons">
        <button type="button" data-active={mode === 'overview'} onClick={() => setMode('overview')}>
          전체 보기
        </button>
        <button type="button" data-active={mode === 'thirdPerson'} onClick={() => setMode('thirdPerson')}>
          3인칭 시점
        </button>
      </div>
    </div>
  )
}

export default Map3DView
