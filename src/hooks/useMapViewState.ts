import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  publishMapSnapshot,
  subscribeMapCommand,
  type AgentMapCommand,
} from '../agent/runtime/agentEventBus'
import type { Point2 } from '../data/floorPlan'
import type { ViewMode } from '../types/scene'

type MinimapPlayerPosition = { u: number; v: number; yaw: number }

export type RouteDisplaySurface = 'main' | 'minimap'

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
  const [missionVersion, setMissionVersion] = useState(0)
  const [minimapPlayerPos, setMinimapPlayerPos] = useState<MinimapPlayerPosition | null>(null)
  const [routeDisplaySurface, setRouteDisplaySurface] = useState<RouteDisplaySurface>('main')
  const navigationActiveRef = useRef(false)
  const modeRef = useRef(mode)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const isEdit = mode === 'edit'
  const isOverviewLike = mode === 'overview' || mode === 'edit'

  const handleNewMission = useCallback(() => {
    setMissionVersion((v) => v + 1)
  }, [])

  const handleViewModeChange = useCallback((next: ViewMode) => {
    setMode(next)
    clearSelection()
  }, [clearSelection])

  const handleMinimapToggle = useCallback(() => {
    if (mode === 'topDown') {
      setMode('overview')
      clearSelection()
      return
    }
    if (mode === 'overview') {
      setMode('topDown')
      clearSelection()
    }
  }, [clearSelection, mode])

  const startNavigationView = useCallback(() => {
    setMode('topDown')
    setRouteDisplaySurface('main')
    handleNewMission()
  }, [handleNewMission])

  useEffect(() => {
    return subscribeMapCommand((command: AgentMapCommand) => {
      if (command.type === 'REPLAN_SHORTEST') {
        handleNewMission()
      }
      if (command.type === 'PREVIEW_NAV_PLAN') {
        if (navigationActiveRef.current) return
        setMode('overview')
        setRouteDisplaySurface('main')
        handleNewMission()
      }
      if (command.type === 'START_NAVIGATION') {
        navigationActiveRef.current = true
        startNavigationView()
      }
      if (command.type === 'RESUME_MOBILITY') {
        if (modeRef.current === 'overview') {
          setMode('topDown')
        }
      }
    })
  }, [handleNewMission, startNavigationView])

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
    routeDisplaySurface,
    minimapPlayerPos,
    setMinimapPlayerPos,
    handleNewMission,
    handleViewModeChange,
    handleMinimapToggle,
    startNavigationView,
  }), [
    mode,
    isEdit,
    isOverviewLike,
    missionVersion,
    routeDisplaySurface,
    minimapPlayerPos,
    handleNewMission,
    handleViewModeChange,
    handleMinimapToggle,
    startNavigationView,
  ])
}
