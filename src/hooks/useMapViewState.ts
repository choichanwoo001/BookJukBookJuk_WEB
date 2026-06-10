import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  publishMapSnapshot,
  subscribeMapCommand,
  type AgentMapCommand,
} from '../agent/runtime/agentEventBus'
import {
  THIRD_PERSON_DEFAULT_FOV,
  WALK_DEFAULT_FOV,
  ZOOM_FOV_MAX,
  ZOOM_FOV_MIN,
} from '../config/constants'
import type { Point2 } from '../data/floorPlan'
import type { ViewMode } from '../types/scene'

type MinimapPlayerPosition = { u: number; v: number; yaw: number }

export function useMapViewState({
  playerWorldXzRef,
  activeLegRef,
  clearSelection,
}: {
  playerWorldXzRef: RefObject<Point2 | null>
  activeLegRef: RefObject<number | null>
  clearSelection: () => void
}) {
  const [mode, setMode] = useState<ViewMode>('overview')
  const [firstPersonFov, setFirstPersonFov] = useState(WALK_DEFAULT_FOV)
  const [thirdPersonFov, setThirdPersonFov] = useState(THIRD_PERSON_DEFAULT_FOV)
  const [missionVersion, setMissionVersion] = useState(0)
  const [prevWalkMode, setPrevWalkMode] = useState<'firstPerson' | 'thirdPerson'>('firstPerson')
  const [minimapPlayerPos, setMinimapPlayerPos] = useState<MinimapPlayerPosition | null>(null)

  const isEdit = mode === 'edit'
  const isOverviewLike = mode === 'overview' || mode === 'edit'
  const walkFov = mode === 'thirdPerson' ? thirdPersonFov : firstPersonFov

  const handleNewMission = useCallback(() => {
    setMissionVersion((v) => v + 1)
  }, [])

  const handleViewModeChange = useCallback((next: ViewMode) => {
    setMode(next)
    clearSelection()
  }, [clearSelection])

  const handleMinimapToggle = useCallback(() => {
    if (mode === 'firstPerson' || mode === 'thirdPerson') {
      setPrevWalkMode(mode)
      setMode('overview')
      clearSelection()
      return
    }
    if (mode === 'overview') {
      setMode(prevWalkMode)
      clearSelection()
    }
  }, [clearSelection, mode, prevWalkMode])

  const handleWalkFovChange = useCallback((next: number) => {
    const v = Math.min(ZOOM_FOV_MAX, Math.max(ZOOM_FOV_MIN, next))
    if (mode === 'thirdPerson') setThirdPersonFov(v)
    else setFirstPersonFov(v)
  }, [mode])

  useEffect(() => {
    return subscribeMapCommand((command: AgentMapCommand) => {
      if (command.type === 'REPLAN_SHORTEST') {
        handleNewMission()
      }
      if (command.type === 'PREVIEW_ROUTE') {
        setPrevWalkMode('thirdPerson')
        setMode('overview')
        handleNewMission()
      }
      if (command.type === 'START_NAVIGATION') {
        setPrevWalkMode('thirdPerson')
        setMode('thirdPerson')
        handleNewMission()
      }
      if (command.type === 'PAUSE_MOBILITY' && (mode === 'firstPerson' || mode === 'thirdPerson')) {
        setPrevWalkMode(mode)
        setMode('overview')
      }
      if (command.type === 'RESUME_MOBILITY' && mode === 'overview') {
        setMode(prevWalkMode)
      }
      if (command.type === 'GO_CHECKOUT') {
        setPrevWalkMode('thirdPerson')
        setMode('overview')
      }
    })
  }, [handleNewMission, mode, prevWalkMode])

  useEffect(() => {
    publishMapSnapshot({
      version: AGENT_MAP_EVENT_VERSION,
      playerXz: playerWorldXzRef.current,
      missionVersion,
      activeLeg: activeLegRef.current,
      arrivedLeg: null,
    })
  }, [activeLegRef, missionVersion, minimapPlayerPos, playerWorldXzRef])

  return useMemo(() => ({
    mode,
    isEdit,
    isOverviewLike,
    missionVersion,
    minimapPlayerPos,
    setMinimapPlayerPos,
    walkFov,
    handleNewMission,
    handleViewModeChange,
    handleMinimapToggle,
    handleWalkFovChange,
  }), [
    mode,
    isEdit,
    isOverviewLike,
    missionVersion,
    minimapPlayerPos,
    walkFov,
    handleNewMission,
    handleViewModeChange,
    handleMinimapToggle,
    handleWalkFovChange,
  ])
}
