import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { useMouseDrag } from '../../hooks/useMouseDrag'
import {
  THIRD_PERSON_DISTANCE_M,
  THIRD_PERSON_TARGET_HEIGHT_M,
  THIRD_PERSON_LOOK_AHEAD_M,
  THIRD_PERSON_MIN_CAMERA_Y_M,
  THIRD_PERSON_MAX_CAMERA_Y_M,
  MOUSE_LOOK_SENSITIVITY,
  MOUSE_LOOK_PITCH_MIN,
  MOUSE_LOOK_PITCH_MAX,
  ZOOM_FOV_MIN,
  ZOOM_FOV_MAX,
  ZOOM_FOV_SENSITIVITY,
  OVERVIEW_ZOOM_SENSITIVITY,
  OVERVIEW_Y_MIN,
  OVERVIEW_Y_MAX,
} from '../../config/constants'

export function CameraZoomController({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera

    const onWheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      const delta = event.deltaY * ZOOM_FOV_SENSITIVITY
      perspectiveCamera.fov = Math.min(ZOOM_FOV_MAX, Math.max(ZOOM_FOV_MIN, perspectiveCamera.fov + delta))
      perspectiveCamera.updateProjectionMatrix()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [camera, enabled, gl])

  return null
}

export function OverviewZoomController() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * OVERVIEW_ZOOM_SENSITIVITY
      perspectiveCamera.position.y = Math.min(OVERVIEW_Y_MAX, Math.max(OVERVIEW_Y_MIN, perspectiveCamera.position.y + delta))
      perspectiveCamera.updateProjectionMatrix()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [camera, gl])

  return null
}

export function MouseLookController({
  yawRef,
  pitchRef,
  enabled,
  isFreeLookRef,
}: {
  yawRef: RefObject<number>
  pitchRef: RefObject<number>
  enabled: boolean
  isFreeLookRef: RefObject<boolean>
}) {
  const { camera, gl } = useThree()

  const onStart = useCallback(() => {
    isFreeLookRef.current = true
  }, [isFreeLookRef])

  const onMove = useCallback((dx: number, dy: number) => {
    yawRef.current -= dx * MOUSE_LOOK_SENSITIVITY
    pitchRef.current = Math.max(MOUSE_LOOK_PITCH_MIN, Math.min(MOUSE_LOOK_PITCH_MAX, pitchRef.current - dy * MOUSE_LOOK_SENSITIVITY))
    if ('isPerspectiveCamera' in camera && camera.isPerspectiveCamera) {
      const perspectiveCamera = camera as ThreePerspectiveCamera
      perspectiveCamera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    }
  }, [camera, pitchRef, yawRef])

  const options = useMemo(() => ({ onStart }), [onStart])

  useMouseDrag(enabled ? gl.domElement : null, onMove, options)

  useEffect(() => {
    if (!enabled) return
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera
    perspectiveCamera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ')
  }, [camera, enabled, pitchRef, yawRef])

  return null
}

export function ThirdPersonCameraRig({
  yawRef,
  pitchRef,
  enabled,
  characterYawRef,
  isFreeLookRef,
}: {
  yawRef: RefObject<number>
  pitchRef: RefObject<number>
  enabled: boolean
  characterYawRef: RefObject<number>
  isFreeLookRef: RefObject<boolean>
}) {
  const { camera } = useThree()
  const desiredPositionRef = useRef(new Vector3())
  const lookTargetRef = useRef(new Vector3(0, THIRD_PERSON_TARGET_HEIGHT_M, 0))

  useFrame((_, delta) => {
    if (!enabled) return
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    if (!isFreeLookRef.current) {
      let diff = characterYawRef.current - yawRef.current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      yawRef.current += diff * (1 - Math.exp(-delta * 8))
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

export function OverviewPanController({
  button,
  requireSpaceKey = false,
}: {
  button?: number
  requireSpaceKey?: boolean
} = {}) {
  const { camera, gl } = useThree()
  const isSpacePressedRef = useRef(false)

  useEffect(() => {
    if (!requireSpaceKey) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') isSpacePressedRef.current = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') isSpacePressedRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [requireSpaceKey])

  const onMove = useCallback((dx: number, dy: number) => {
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera
    const panSpeed = perspectiveCamera.position.y * 0.002
    /* eslint-disable react-hooks/immutability -- Three.js PerspectiveCamera position mutation */
    perspectiveCamera.position.x -= dx * panSpeed
    perspectiveCamera.position.z -= dy * panSpeed
    /* eslint-enable react-hooks/immutability */
  }, [camera])

  const options = useMemo(() => {
    const onStart = requireSpaceKey
      ? () => isSpacePressedRef.current
      : undefined
    return { button, onStart }
  }, [button, requireSpaceKey])
  useMouseDrag(gl.domElement, onMove, options)

  return null
}
