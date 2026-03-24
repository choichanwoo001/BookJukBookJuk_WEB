import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Grid, PerspectiveCamera } from '@react-three/drei'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import {
  wallRects,
  floorRects,
  mapWidth,
  mapDepth,
  FLOOR_HEIGHT_M,
  WALL_THICKNESS_M,
} from '../data/floorPlan'
import { useWorldMovement } from '../hooks/useWorldMovement'

type ViewMode = 'firstPerson' | 'overview'

const GRID_SIZE = Math.max(mapWidth, mapDepth) + 10

const unitBox = new BoxGeometry(1, 1, 1)
const wallMaterial = new MeshStandardMaterial({ color: '#cfd9ea', metalness: 0.08, roughness: 0.84 })
const floorMaterial = new MeshStandardMaterial({ color: '#f2f4f8' })

function WallInstances() {
  const meshRef = useRef<InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const mat = new Matrix4()
    const scaleVec = new Vector3()
    for (let i = 0; i < wallRects.length; i++) {
      const r = wallRects[i]
      mat.makeTranslation(r.cx, FLOOR_HEIGHT_M * 0.5, r.cz)
      scaleVec.set(r.w || WALL_THICKNESS_M, FLOOR_HEIGHT_M, r.d || WALL_THICKNESS_M)
      mat.scale(scaleVec)
      mesh.setMatrixAt(i, mat)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      args={[unitBox, wallMaterial, wallRects.length]}
      frustumCulled={false}
    />
  )
}

function FloorInstances() {
  const meshRef = useRef<InstancedMesh>(null)
  const FLOOR_THICKNESS = 0.02

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const mat = new Matrix4()
    const scaleVec = new Vector3()
    for (let i = 0; i < floorRects.length; i++) {
      const r = floorRects[i]
      mat.makeTranslation(r.cx, FLOOR_THICKNESS * 0.5, r.cz)
      scaleVec.set(r.w, FLOOR_THICKNESS, r.d)
      mat.scale(scaleVec)
      mesh.setMatrixAt(i, mat)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      args={[unitBox, floorMaterial, floorRects.length]}
      frustumCulled={false}
    />
  )
}

function CameraZoomController({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    const minFov = 20
    const maxFov = 90
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
    const minPitch = -0.65
    const maxPitch = 0.45
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

function SceneContent({ mode }: { mode: ViewMode }) {
  const worldRef = useRef<Group>(null)
  const storedWorldPositionRef = useRef<[number, number]>([0, 0])
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.06)
  const isFirstPerson = mode === 'firstPerson'
  useWorldMovement(worldRef, yawRef, isFirstPerson)

  useEffect(() => {
    if (!worldRef.current) return

    if (!isFirstPerson) {
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
    pitchRef.current = -0.06
  }, [isFirstPerson])

  return (
    <>
      <color attach="background" args={['#0c111d']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[20, 30, 10]} intensity={1.1} />
      <directionalLight position={[-20, 25, -15]} intensity={0.35} />

      {isFirstPerson ? (
        <>
          <PerspectiveCamera
            key="first-person-camera"
            makeDefault
            position={[0, 1.62, 0]}
            rotation={[-0.06, 0, 0]}
            fov={62}
          />
          <CameraZoomController enabled />
          <MouseLookController yawRef={yawRef} pitchRef={pitchRef} enabled />
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
          <OverviewPanController />
        </>
      )}

      <group ref={worldRef}>
        <FloorInstances />

        <Grid
          args={[GRID_SIZE, GRID_SIZE]}
          position={[0, 0.001, 0]}
          cellSize={1}
          cellThickness={0.25}
          sectionSize={5}
          sectionThickness={0.5}
          fadeDistance={60}
          fadeStrength={1.4}
          cellColor="#4f5d78"
          sectionColor="#7483a5"
        />

        <WallInstances />
      </group>
    </>
  )
}

function Map3DView() {
  const [mode, setMode] = useState<ViewMode>('overview')

  return (
    <div className="map3DContainer">
      <Canvas dpr={[1, 2]}>
        <SceneContent mode={mode} />
      </Canvas>
      <div className="mapViewButtons">
        <button type="button" onClick={() => setMode('overview')}>
          전체 보기
        </button>
        <button type="button" onClick={() => setMode('firstPerson')}>
          1인칭 시점
        </button>
      </div>
    </div>
  )
}

export default Map3DView
