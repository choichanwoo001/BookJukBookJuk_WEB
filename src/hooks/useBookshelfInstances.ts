import { useCallback, useMemo, useState } from 'react'
import { bookshelfInstances } from '../data/floorPlan'
import { DEFAULT_BOOKSHELF_SIZE, FIXED_SELECTION_RADIUS_M } from '../config/constants'
import { nearestWallInfo } from '../utils/wallAlignment'
import { offsetDuplicateBookshelf, clampFixturePlanDimension } from '../utils/bookshelfClipboard'
import { findNearestBookshelfInCircle } from '../utils/bookshelfSelection'
import type { FixtureRenderInstance, PickPoint } from '../types/scene'

function buildInitialInstances(): FixtureRenderInstance[] {
  return bookshelfInstances.map<FixtureRenderInstance>(item => ({
    kind: 'bookshelf',
    cx: item.cx,
    cz: item.cz,
    w: item.w,
    d: item.d,
    yaw: item.yaw,
    h: DEFAULT_BOOKSHELF_SIZE.h,
    shelfId: item.shelfId,
  }))
}

function buildInitialSectors(): Array<number | null | undefined> {
  return bookshelfInstances.map(item => item.sector)
}

function stripSector(inst: FixtureRenderInstance): FixtureRenderInstance {
  const geometry = { ...inst }
  delete geometry.sector
  return geometry
}

function attachSector(
  inst: FixtureRenderInstance,
  sector: number | null | undefined,
): FixtureRenderInstance {
  return sector !== undefined ? { ...inst, sector } : inst
}

export function useBookshelfInstances() {
  const [instances, setInstances] = useState<FixtureRenderInstance[]>(buildInitialInstances)
  const [sectorByIndex, setSectorByIndex] = useState<Array<number | null | undefined>>(buildInitialSectors)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const initialInstances = useMemo(() => buildInitialInstances(), [])
  const initialSectorByIndex = useMemo(() => buildInitialSectors(), [])
  const initialInstancesWithSectors = useMemo(
    () => initialInstances.map((inst, i) => attachSector(inst, initialSectorByIndex[i])),
    [initialInstances, initialSectorByIndex],
  )
  const instancesWithSectors = useMemo(
    () => instances.map((inst, i) => attachSector(inst, sectorByIndex[i])),
    [instances, sectorByIndex],
  )

  const handleUpdateInstance = useCallback((index: number, patch: Partial<FixtureRenderInstance>) => {
    const { sector, ...geometryPatch } = patch
    if ('sector' in patch) {
      setSectorByIndex(prev => prev.map((value, i) => i === index ? sector : value))
    }
    if (Object.keys(geometryPatch).length > 0) {
      setInstances(prev => prev.map((inst, i) => i === index ? { ...inst, ...geometryPatch } : inst))
    }
  }, [])

  const handleSetSector = useCallback((index: number, sector: number | null) => {
    setSectorByIndex(prev => prev.map((value, i) => i === index ? sector : value))
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
    setSectorByIndex((prev) => [
      ...prev,
      selectedIndex !== null ? sectorByIndex[selectedIndex] : undefined,
    ])
  }, [selectedIndex, sectorByIndex])

  const addInstance = useCallback((inst: FixtureRenderInstance) => {
    const { sector } = inst
    setInstances((prev) => {
      const next = [...prev, stripSector(inst)]
      setSelectedIndex(next.length - 1)
      return next
    })
    setSectorByIndex((prev) => [...prev, sector])
  }, [])

  const handleDeleteBookshelf = useCallback(() => {
    if (selectedIndex === null) return
    setInstances((prev) => prev.filter((_, i) => i !== selectedIndex))
    setSectorByIndex((prev) => prev.filter((_, i) => i !== selectedIndex))
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
    instancesWithSectors,
    sectorByIndex,
    selectedIndex,
    setSelectedIndex,
    initialInstances,
    initialInstancesWithSectors,
    handleUpdateInstance,
    handleSetSector,
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
