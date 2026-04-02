import { useEffect } from 'react'

export function useMouseDrag(
  element: HTMLElement | null,
  onMove: (dx: number, dy: number) => void,
  options?: {
    onStart?: (event: MouseEvent) => void | boolean
    button?: number
  },
) {
  useEffect(() => {
    if (!element) return
    const button = options?.button ?? 0
    let isDragging = false
    let lastX = 0
    let lastY = 0

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== button) return
      const shouldStart = options?.onStart?.(event)
      if (shouldStart === false) return
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
      onMove(dx, dy)
    }

    const stopDragging = () => { isDragging = false }

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
  }, [element, onMove, options])
}
