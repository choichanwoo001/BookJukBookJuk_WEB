import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { PickPoint, SurfaceKind } from '../../types/scene'

function usePickHandler(
  worldRef: MutableRefObject<Group | null>,
  onAddSelection: (point: PickPoint) => void,
  requireAlt: boolean,
) {
  return useCallback((surface: SurfaceKind) => (event: ThreeEvent<PointerEvent>) => {
    if (requireAlt && !event.altKey) return
    if (!worldRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onAddSelection({ x: localPoint.x, y: localPoint.y, z: localPoint.z, surface })
  }, [onAddSelection, requireAlt, worldRef])
}

function useWallSelectPickHandler(
  worldRef: MutableRefObject<Group | null>,
  onWallSelectPoint: (point: PickPoint) => void,
) {
  return useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!worldRef.current) return
    event.stopPropagation()
    event.nativeEvent.preventDefault()
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onWallSelectPoint({ x: localPoint.x, y: localPoint.y, z: localPoint.z, surface: 'floor' })
  }, [onWallSelectPoint, worldRef])
}

function useWallSelectMoveHandler(
  worldRef: MutableRefObject<Group | null>,
  onWallSelectPreview: (point: PickPoint | null) => void,
) {
  return useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!worldRef.current) return
    const localPoint = worldRef.current.worldToLocal(event.point.clone())
    onWallSelectPreview({ x: localPoint.x, y: localPoint.y, z: localPoint.z, surface: 'floor' })
  }, [onWallSelectPreview, worldRef])
}

export function useScenePickHandlers({
  isAreaSelection,
  isWallSelect,
  worldRef,
  onAddSelection,
  onWallSelectPoint,
  onWallSelectPreview,
}: {
  isAreaSelection: boolean
  isWallSelect: boolean
  worldRef: MutableRefObject<Group | null>
  onAddSelection: (point: PickPoint) => void
  onWallSelectPoint?: (point: PickPoint) => void
  onWallSelectPreview?: (point: PickPoint | null) => void
}) {
  const pickHandler = usePickHandler(worldRef, onAddSelection, true)
  const wallSelectPickHandler = useWallSelectPickHandler(worldRef, onWallSelectPoint ?? (() => {}))
  const wallSelectMoveHandler = useWallSelectMoveHandler(worldRef, onWallSelectPreview ?? (() => {}))

  return {
    floorPickHandler: useMemo(() => {
      if (isWallSelect) return wallSelectPickHandler
      if (isAreaSelection) return pickHandler('floor')
      return undefined
    }, [isAreaSelection, isWallSelect, pickHandler, wallSelectPickHandler]),
    floorPointerMoveHandler: useMemo(
      () => (isWallSelect ? wallSelectMoveHandler : undefined),
      [isWallSelect, wallSelectMoveHandler],
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
