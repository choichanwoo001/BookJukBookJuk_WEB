import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { useMouseDrag } from '../../hooks/useMouseDrag'
import {
  TOP_DOWN_CAMERA_Y_M,
  TOP_DOWN_FOLLOW_YAW_LAMBDA,
  TOP_DOWN_ROBOT_FOLLOW_YAW_LAMBDA,
  TOP_DOWN_Y_MIN,
  TOP_DOWN_Y_MAX,
  TOP_DOWN_ZOOM_SENSITIVITY,
  OVERVIEW_ZOOM_SENSITIVITY,
  OVERVIEW_Y_MIN,
  OVERVIEW_Y_MAX,
  OVERVIEW_PAN_SPEED,
  MAP_VIEW_YAW_OFFSET_RAD,
} from '../../config/constants'
import { overviewPanDy } from '../../utils/overviewDisplayFlip'

function normalizeAngle(angle: number) {
  let normalized = angle
  while (normalized > Math.PI) normalized -= Math.PI * 2
  while (normalized < -Math.PI) normalized += Math.PI * 2
  return normalized
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + normalizeAngle(target - current) * alpha
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

export function TopDownZoomController({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const element = gl.domElement
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return
    const perspectiveCamera = camera as ThreePerspectiveCamera

    const onWheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      const delta = event.deltaY * TOP_DOWN_ZOOM_SENSITIVITY
      perspectiveCamera.position.y = Math.min(
        TOP_DOWN_Y_MAX,
        Math.max(TOP_DOWN_Y_MIN, perspectiveCamera.position.y + delta),
      )
      perspectiveCamera.updateProjectionMatrix()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [camera, enabled, gl])

  return null
}

export function TopDownCameraRig({
  yawRef,
  enabled,
  robotFollowMode = false,
}: {
  yawRef: RefObject<number>
  enabled: boolean
  robotFollowMode?: boolean
}) {
  const displayYawRef = useRef(0)
  const snapOnNextFrameRef = useRef(true)

  useLayoutEffect(() => {
    snapOnNextFrameRef.current = true
    displayYawRef.current = yawRef.current
  }, [enabled, yawRef])

  useFrame((state, delta) => {
    if (!enabled) return
    const camera = state.camera
    if (!('isPerspectiveCamera' in camera) || !camera.isPerspectiveCamera) return

    const yawLambda = robotFollowMode
      ? TOP_DOWN_ROBOT_FOLLOW_YAW_LAMBDA
      : TOP_DOWN_FOLLOW_YAW_LAMBDA

    if (snapOnNextFrameRef.current) {
      displayYawRef.current = yawRef.current
      snapOnNextFrameRef.current = false
    } else {
      const yawAlpha = 1 - Math.exp(-delta * yawLambda)
      displayYawRef.current = lerpAngle(displayYawRef.current, yawRef.current, yawAlpha)
    }

    if (camera.position.y < TOP_DOWN_Y_MIN || camera.position.y > TOP_DOWN_Y_MAX) {
      camera.position.y = TOP_DOWN_CAMERA_Y_M
    }
    camera.position.x = 0
    camera.position.z = 0
    camera.rotation.set(-Math.PI / 2, displayYawRef.current, 0, 'YXZ')
    camera.up.set(0, 0, -1)
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
    const panSpeed = perspectiveCamera.position.y * OVERVIEW_PAN_SPEED
    /** overview 카메라 부모 `group`의 Y 회전(MAP_VIEW_YAW_OFFSET_RAD)과 팬 방향 정합 */
    const panSign = Math.cos(MAP_VIEW_YAW_OFFSET_RAD)
    /* eslint-disable react-hooks/immutability -- Three.js PerspectiveCamera position mutation */
    const panDy = overviewPanDy(dy)
    perspectiveCamera.position.x -= dx * panSpeed * panSign
    perspectiveCamera.position.z -= panDy * panSpeed * panSign
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
