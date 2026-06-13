import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dispatchPauseMobility,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import { ENTRANCE_SPAWN, type Point2 } from '../data/floorPlan'
import { buildDemoScenarioRoute } from '../utils/demoScenarioRoute'
import type { NavigationMobilityPhase } from '../types/navigationMobility'

export function useScenarioRoutePreview({
  playerWorldXzRef,
  setMinimapPlayerPos,
  startNavigationView,
}: {
  playerWorldXzRef: { current: Point2 | null }
  setMinimapPlayerPos: (pos: { u: number; v: number; yaw: number } | null) => void
  startNavigationView: () => void
}) {
  const [scenarioDirectGoals, setScenarioDirectGoals] = useState<Point2[] | null>(null)
  const [scenarioRoutePreviewActive, setScenarioRoutePreviewActive] = useState(false)
  const [demoNavigationActive, setDemoNavigationActive] = useState(false)
  const [demoMobilityPaused, setDemoMobilityPaused] = useState(false)
  const [mobilityPhase, setMobilityPhase] = useState<NavigationMobilityPhase>('idle')
  const scenarioPlaybackHeadingRef = useRef<number | null>(null)
  const demoNavigationActiveRef = useRef(false)

  const pauseDemoMobility = useCallback(() => {
    dispatchPauseMobility()
  }, [])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'PREVIEW_ROUTE') {
        if (demoNavigationActiveRef.current) return
        const route = buildDemoScenarioRoute()
        const goals = route.stops
          .filter((s) => s.kind === 'book' || s.kind === 'checkout')
          .map((s) => s.goal)

        setDemoMobilityPaused(false)
        setDemoNavigationActive(false)
        demoNavigationActiveRef.current = false
        setScenarioDirectGoals(goals)
        setScenarioRoutePreviewActive(true)
        setMinimapPlayerPos(null)
        scenarioPlaybackHeadingRef.current = null
      }

      if (command.type === 'START_NAVIGATION') {
        demoNavigationActiveRef.current = true
        setDemoMobilityPaused(false)
        startNavigationView()
        setScenarioDirectGoals(null)
        setScenarioRoutePreviewActive(false)
        setDemoNavigationActive(true)
        scenarioPlaybackHeadingRef.current = null
        playerWorldXzRef.current = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
      }

      if (command.type === 'PAUSE_MOBILITY') {
        demoNavigationActiveRef.current = false
        setDemoNavigationActive(false)
        setDemoMobilityPaused(true)
        setScenarioRoutePreviewActive(false)
      }
    })
  }, [playerWorldXzRef, setMinimapPlayerPos, startNavigationView])

  return {
    demoNavigationActive,
    demoMobilityPaused,
    handleMobilityPhaseChange: setMobilityPhase,
    mobilityPhase,
    pauseDemoMobility,
    scenarioDirectGoals,
    scenarioPlaybackHeadingRef,
    scenarioRoutePreviewActive,
  }
}
