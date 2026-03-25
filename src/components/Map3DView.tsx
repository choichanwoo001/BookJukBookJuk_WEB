import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import {
  BufferGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
} from 'three'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import {
  wallPolylines,
  floorRects,
  FLOOR_HEIGHT_M,
} from '../data/floorPlan'
import { useWorldMovement } from '../hooks/useWorldMovement'

type ViewMode = 'firstPerson' | 'overview'

const wallMaterial = new MeshStandardMaterial({ color: '#F5F0E8', roughness: 0.92, metalness: 0.0, side: 2 }) // DoubleSide
const floorMaterial = new MeshStandardMaterial({ color: '#B5885A', roughness: 0.85, metalness: 0.02, side: 2 })
const ceilingMaterial = new MeshStandardMaterial({ color: '#FAF6F0', roughness: 0.95, metalness: 0.0, side: 2 })
const SURFACE_WALL_OVERLAP_M = 0.05

function WallRibbonMesh() {
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
        const b0 = base + i * 2,      t0 = base + i * 2 + 1
        const b1 = base + next * 2,   t1 = base + next * 2 + 1
        indices.push(b0, b1, t1, b0, t1, t0)
      }
    }

    if (positions.length === 0) {
      return new BoxGeometry(0.001, 0.001, 0.001) as BufferGeometry
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  return <mesh geometry={wallGeometry} material={wallMaterial} frustumCulled={false} />
}

function RoomSurfaces({ isFirstPerson }: { isFirstPerson: boolean }) {
  const shapeGeometry = useMemo(() => {
    if (wallPolylines.length === 0) return new BufferGeometry()
    let maxArea = -1
    let outerLoopIdx = 0
    for (let i = 0; i < wallPolylines.length; i++) {
      const loop = wallPolylines[i]
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const [x, z] of loop) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const area = (maxX - minX) * (maxZ - minZ)
      if (area > maxArea) {
        maxArea = area
        outerLoopIdx = i
      }
    }

    const outerPoints = wallPolylines[outerLoopIdx]
    const shape = new Shape()
    shape.moveTo(outerPoints[0][0], -outerPoints[0][1])
    for (let i = 1; i < outerPoints.length; i++) {
      shape.lineTo(outerPoints[i][0], -outerPoints[i][1])
    }

    for (let i = 0; i < wallPolylines.length; i++) {
      if (i === outerLoopIdx) continue
      const loop = wallPolylines[i]
      if (loop.length < 3) continue
      const path = new Path()
      path.moveTo(loop[0][0], -loop[0][1])
      for (let j = 1; j < loop.length; j++) {
        path.lineTo(loop[j][0], -loop[j][1])
      }
      shape.holes.push(path)
    }
    
    const geo = new ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2) // Lay it flat on XZ
    return geo
  }, [])

  return (
    <>
      <mesh geometry={shapeGeometry} material={floorMaterial} frustumCulled={false} position={[0, -SURFACE_WALL_OVERLAP_M + 0.001, 0]} />
      {isFirstPerson && (
        <mesh 
          geometry={shapeGeometry} 
          material={ceilingMaterial} 
          frustumCulled={false} 
          position={[0, FLOOR_HEIGHT_M + SURFACE_WALL_OVERLAP_M - 0.001, 0]} 
        />
      )}
    </>
  )
}

function BookstoreLights() {
  const positions = useMemo(() => {
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const r of floorRects) {
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
        const hasFloor = floorRects.some(r =>
          x >= r.cx - r.w / 2 && x <= r.cx + r.w / 2 &&
          z >= r.cz - r.d / 2 && z <= r.cz + r.d / 2,
        )
        if (hasFloor) result.push([x, y, z])
      }
    }
    return result
  }, [])

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

  const [markers, setMarkers] = useState<{x:number, z:number}[]>([])

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const { x, z } = e.point
    setMarkers(prev => {
      const next = [...prev, { x, z }]
      const str = next.map(p => `{ cx: ${p.x.toFixed(2)}, cz: ${p.z.toFixed(2)}, radius: 0.4 },`).join('\n')
      navigator.clipboard.writeText(str)
      return next
    })
  }

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
      <color attach="background" args={['#1a1410']} />
      <ambientLight color="#FFF5E6" intensity={0.5} />
      <directionalLight position={[20, 30, 10]} color="#FFECD2" intensity={0.8} />
      <directionalLight position={[-20, 25, -15]} color="#FFECD2" intensity={0.3} />

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

      <group ref={worldRef} onDoubleClick={handleDoubleClick}>
        <RoomSurfaces isFirstPerson={isFirstPerson} />
        <WallRibbonMesh />
        <BookstoreLights />
        {markers.map((m, idx) => (
          <mesh key={idx} position={[m.x, FLOOR_HEIGHT_M * 0.5, m.z]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#FF3333" emissive="#FF3333" emissiveIntensity={0.5} />
          </mesh>
        ))}
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
