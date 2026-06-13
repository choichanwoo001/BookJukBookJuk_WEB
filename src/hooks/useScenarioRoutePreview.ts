import { useEffect, useRef, useState } from 'react'
import { subscribeMapCommand } from '../agent/runtime/agentEventBus'
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
  const [mobilityPhase, setMobilityPhase] = useState<NavigationMobilityPhase>('idle')
  const scenarioPlaybackHeadingRef = useRef<number | null>(null)

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type === 'PREVIEW_ROUTE') {
        const route = buildDemoScenarioRoute()
        const goals = route.stops
          .filter((s) => s.kind === 'book' || s.kind === 'checkout')
          .map((s) => s.goal)

        setDemoNavigationActive(false)
        setScenarioDirectGoals(goals)
        setScenarioRoutePreviewActive(true)
        setMinimapPlayerPos(null)
        scenarioPlaybackHeadingRef.current = null
      }

      if (command.type === 'START_NAVIGATION') {
        startNavigationView()
        setScenarioDirectGoals(null)
        setScenarioRoutePreviewActive(false)
        setDemoNavigationActive(true)
        scenarioPlaybackHeadingRef.current = null
        playerWorldXzRef.current = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
      }

      if (command.type === 'PAUSE_MOBILITY') {
        setDemoNavigationActive(false)
      }
    })
  }, [playerWorldXzRef, setMinimapPlayerPos, startNavigationView])

  return {
    demoNavigationActive,
    handleMobilityPhaseChange: setMobilityPhase,
    mobilityPhase,
    scenarioDirectGoals,
    scenarioPlaybackHeadingRef,
    scenarioRoutePreviewActive,
  }
}
