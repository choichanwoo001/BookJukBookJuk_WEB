import { useCallback, useEffect, useRef } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import {
  EDIT_YAW_DRAG_SENSITIVITY,
  EDIT_YAW_WHEEL_SENSITIVITY,
} from '../config/constants'
import type { FixtureRenderInstance } from '../types/scene'
import { clientYToNdcY } from '../utils/overviewDisplayFlip'

export type EditDragControllerOptions = {
  selectedIndex: number | null
  instances: FixtureRenderInstance[]
  onUpdate: (index: number, patch: Partial<FixtureRenderInstance>) => void
  suspend: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function useEditDragController({
  selectedIndex,
  instances,
  onUpdate,
  suspend,
  onDragStart,
  onDragEnd,
}: EditDragControllerOptions) {
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
      clientYToNdcY(clientY, rect.top, rect.height),
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
      if (dist > maxGrab) return

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
  }, [gl, screenToGround, onUpdate, suspend, onDragStart, onDragEnd])
}
