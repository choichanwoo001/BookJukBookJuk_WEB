import { useCallback, useMemo, useState } from 'react'
import { bookshelfInstances } from '../data/floorPlan'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import { DEFAULT_BOOKSHELF_SIZE, FIXED_SELECTION_RADIUS_M } from '../config/constants'
import { nearestWallInfo } from '../utils/wallAlignment'
import { offsetDuplicateBookshelf, clampFixturePlanDimension } from '../utils/bookshelfClipboard'
import { findNearestBookshelfInCircle } from '../utils/bookshelfSelection'
import { buildMissionShelfPool } from '../utils/missionShelfPool'
import type { FixtureRenderInstance, PickPoint } from '../types/scene'

function buildInitialInstances(): FixtureRenderInstance[] {
  const main = bookshelfInstances.map<FixtureRenderInstance>(item => ({
    kind: 'bookshelf',
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: DEFAULT_BOOKSHELF_SIZE.h,
  }))
  return buildMissionShelfPool(main, bookshelfOverlayLayerInstances)
}

export function useBookshelfInstances() {
  const [instances, setInstances] = useState<FixtureRenderInstance[]>(buildInitialInstances)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const initialInstances = useMemo(() => buildInitialInstances(), [])

  const handleUpdateInstance = useCallback((index: number, patch: Partial<FixtureRenderInstance>) => {
    setInstances(prev => prev.map((inst, i) => i === index ? { ...inst, ...patch } : inst))
  }, [])

  const handleAddBookshelf = useCallback(() => {
    setInstances((prev) => {
      const base = selectedIndex !== null ? prev[selectedIndex] : null
      const created: FixtureRenderInstance = base
        ? offsetDuplicateBookshelf(base)
        : {
            kind: 'bookshelf',
            cx: 0,
            cz: 0,
            w: DEFAULT_BOOKSHELF_SIZE.w,
            d: DEFAULT_BOOKSHELF_SIZE.d,
            yaw: 0,
            h: DEFAULT_BOOKSHELF_SIZE.h,
          }
      const next = [...prev, created]
      setSelectedIndex(next.length - 1)
      return next
    })
  }, [selectedIndex])

  const addInstance = useCallback((inst: FixtureRenderInstance) => {
    setInstances((prev) => {
      const next = [...prev, inst]
      setSelectedIndex(next.length - 1)
      return next
    })
  }, [])

  const handleDeleteBookshelf = useCallback(() => {
    if (selectedIndex === null) return
    setInstances((prev) => prev.filter((_, i) => i !== selectedIndex))
    setSelectedIndex(null)
  }, [selectedIndex])

  const handleAddSelection = useCallback((point: PickPoint) => {
    const nearest = findNearestBookshelfInCircle(point.x, point.z, FIXED_SELECTION_RADIUS_M, instances)
    if (nearest !== null) {
      setSelectedIndex(nearest)
    }
    return nearest
  }, [instances])

  const handleSnapYawToWallParallel = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    const info = nearestWallInfo(inst.cx, inst.cz)
    if (!info) return
    handleUpdateInstance(selectedIndex, { yaw: info.tangentYaw })
  }, [selectedIndex, instances, handleUpdateInstance])

  const handleSnapYawToWallPerpendicular = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    const info = nearestWallInfo(inst.cx, inst.cz)
    if (!info) return
    handleUpdateInstance(selectedIndex, { yaw: info.normalYaw })
  }, [selectedIndex, instances, handleUpdateInstance])

  const handleUpdateW = useCallback((v: number) => {
    if (selectedIndex === null || !Number.isFinite(v)) return
    handleUpdateInstance(selectedIndex, { w: clampFixturePlanDimension(v) })
  }, [selectedIndex, handleUpdateInstance])

  const handleUpdateD = useCallback((v: number) => {
    if (selectedIndex === null || !Number.isFinite(v)) return
    handleUpdateInstance(selectedIndex, { d: clampFixturePlanDimension(v) })
  }, [selectedIndex, handleUpdateInstance])

  return {
    instances,
    selectedIndex,
    setSelectedIndex,
    initialInstances,
    handleUpdateInstance,
    addInstance,
    handleAddBookshelf,
    handleDeleteBookshelf,
    handleAddSelection,
    handleSnapYawToWallParallel,
    handleSnapYawToWallPerpendicular,
    handleUpdateW,
    handleUpdateD,
  }
}
