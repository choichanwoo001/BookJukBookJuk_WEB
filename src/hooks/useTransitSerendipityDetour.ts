import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchPauseMobility,
  dispatchSetDirectGoals,
  dispatchStartNavigation,
  subscribeDwellEvent,
  subscribeMapCommand,
  subscribeNavigationSync,
  type AgentMapSnapshot,
  type NavigationSyncState,
} from '../agent/runtime/agentEventBus'
import { DEMO_DWELL_BOOK } from '../data/demoScenario'
import { isDemoMode } from '../config/demoMode'
import type { Point2 } from '../data/floorPlan'
import {
  SERENDIPITY_BROWSE_POOL_INDEX,
  serendipityOnlyDirectGoals,
} from '../data/fixtureRobotRoute'
import type { AgentContext, DwellBookCandidate } from '../agent/types'

export type TransitSerendipityDetourDeps = {
  contextRef: RefObject<AgentContext>
  setContext: (patch: Partial<AgentContext>) => void
  appendAssistant: (text: string) => Promise<void>
}

export function useTransitSerendipityDetour({
  contextRef,
  setContext,
  appendAssistant,
}: TransitSerendipityDetourDeps) {
  const navSyncRef = useRef<NavigationSyncState | null>(null)
  const mapSnapshotRef = useRef<AgentMapSnapshot | null>(null)
  const pausePlayerXzRef = useRef<Point2 | null>(null)

  useEffect(() => subscribeNavigationSync((sync) => {
    navSyncRef.current = sync
  }), [])

  useEffect(() => subscribeMapCommand((command) => {
    if (command.type !== 'PAUSE_MOBILITY') return
    if (!isDemoMode()) return

    const ctx = contextRef.current
    if (ctx.extendedRouteActive) return
    if (ctx.transitDetourPhase !== 'idle') return

    const sync = navSyncRef.current
    if (!sync?.navigationActive) return
    if (sync.activeLeg !== 0) return

    const playerXz = mapSnapshotRef.current?.playerXz ?? null
    pausePlayerXzRef.current = playerXz

    setContext({
      transitDetourPhase: 'paused_for_follow',
      resumeLegAfterDetour: 0,
      mobilityPaused: true,
    })
  }), [contextRef, setContext])

  useEffect(() => subscribeDwellEvent((event) => {
    if (event.type !== 'SHELF_ARRIVED') return
    if (!isDemoMode()) return
    if (event.poolIndex !== SERENDIPITY_BROWSE_POOL_INDEX) return

    const ctx = contextRef.current
    if (ctx.transitDetourPhase !== 'serendipity_nav') return

    const dwellBook: DwellBookCandidate = {
      booksId: DEMO_DWELL_BOOK.booksId,
      title: DEMO_DWELL_BOOK.title,
      authors: DEMO_DWELL_BOOK.authors,
      detectedAt: Date.now(),
      source: 'route',
    }

    dispatchPauseMobility()
    setContext({
      transitDetourPhase: 'serendipity_dwell',
      pendingDwellBook: dwellBook,
      awaitingDwellFeedback: true,
      mobilityPaused: true,
    })

    void appendAssistant(
      `"${DEMO_DWELL_BOOK.title}"에 관심을 보이셨는데 장바구니에 담지 않으셨네요. 어떤 점이 마음에 걸리셨는지 말씀해 주시면 그 책 기준으로 더 잘 맞는 책을 추천해드릴게요.`,
    )
  }), [appendAssistant, contextRef, setContext])

  const handleFollowMeDetour = useCallback(() => {
    if (!isDemoMode()) return false
    if (contextRef.current.transitDetourPhase !== 'paused_for_follow') return false

    const from = pausePlayerXzRef.current ?? mapSnapshotRef.current?.playerXz ?? null
    const goals = serendipityOnlyDirectGoals(from ?? undefined)

    setContext({
      transitDetourPhase: 'serendipity_nav',
      mobilityPaused: false,
    })
    dispatchSetDirectGoals(goals)
    dispatchStartNavigation()
    return true
  }, [contextRef, setContext])

  const trackMapSnapshot = useCallback((snapshot: AgentMapSnapshot | null) => {
    mapSnapshotRef.current = snapshot
  }, [])

  return {
    handleFollowMeDetour,
    trackMapSnapshot,
  }
}

export { AGENT_MAP_EVENT_VERSION }
