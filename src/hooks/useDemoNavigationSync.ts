import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dispatchPauseMobility,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import { ENTRANCE_SPAWN, type Point2 } from '../data/floorPlan'
import type { NavigationMobilityPhase } from '../types/navigationMobility'

export function useDemoNavigationSync({
  playerWorldXzRef,
  startNavigationView,
}: {
  playerWorldXzRef: { current: Point2 | null }
  startNavigationView: () => void
}) {
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
      if (command.type === 'START_NAVIGATION') {
        demoNavigationActiveRef.current = true
        setDemoMobilityPaused(false)
        startNavigationView()
        setDemoNavigationActive(true)
        scenarioPlaybackHeadingRef.current = null
        playerWorldXzRef.current = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]
      }

      if (command.type === 'PAUSE_MOBILITY') {
        demoNavigationActiveRef.current = false
        setDemoNavigationActive(false)
        setDemoMobilityPaused(true)
      }
    })
  }, [playerWorldXzRef, startNavigationView])

  return {
    demoNavigationActive,
    demoMobilityPaused,
    handleMobilityPhaseChange: setMobilityPhase,
    mobilityPhase,
    pauseDemoMobility,
    scenarioPlaybackHeadingRef,
  }
}
