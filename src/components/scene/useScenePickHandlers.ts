import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { PickPoint, SurfaceKind } from '../../types/scene'

function usePickHandler(
  worldRef: MutableRefObject<Group | null>,
  onAddSelection: (point: PickPoint) => void,
) {
  return useCallback((surface: SurfaceKind) => (event: ThreeEvent<PointerEvent>) => {
    if (!event.altKey) return
    if (!worldRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onAddSelection({ x: localPoint.x, y: localPoint.y, z: localPoint.z, surface })
  }, [onAddSelection, worldRef])
}

export function useScenePickHandlers({
  isAreaSelection,
  worldRef,
  onAddSelection,
}: {
  isAreaSelection: boolean
  worldRef: MutableRefObject<Group | null>
  onAddSelection: (point: PickPoint) => void
}) {
  const pickHandler = usePickHandler(worldRef, onAddSelection)

  return {
    floorPickHandler: useMemo(
      () => isAreaSelection ? pickHandler('floor') : undefined,
      [isAreaSelection, pickHandler],
    ),
    wallPickHandler: useMemo(
      () => isAreaSelection ? pickHandler('wall') : undefined,
      [isAreaSelection, pickHandler],
    ),
    bookshelfPickHandler: useMemo(
      () => isAreaSelection ? pickHandler('bookshelf') : undefined,
      [isAreaSelection, pickHandler],
    ),
    pillarPickHandler: useMemo(
      () => isAreaSelection ? pickHandler('pillar') : undefined,
      [isAreaSelection, pickHandler],
    ),
  }
}
