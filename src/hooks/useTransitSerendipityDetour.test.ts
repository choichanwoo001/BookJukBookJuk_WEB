import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentContext } from '../agent/types'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
  dispatchPauseMobility,
  publishNavigationSync,
  resetStickyMapCommandsForTest,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import { SERENDIPITY_BROWSE_POOL_INDEX } from '../data/fixtureRobotRoute'
import { useTransitSerendipityDetour } from './useTransitSerendipityDetour'

vi.mock('../config/demoMode', () => ({
  isDemoMode: () => true,
}))

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    state: 'NAV_EXEC',
    mobilityPaused: false,
    listType: '쇼핑리스트',
    shoppingList: [],
    cartItems: [],
    pendingDwellBook: null,
    awaitingDwellFeedback: false,
    skippedDwellBook: null,
    extendedRouteActive: false,
    transitDetourPhase: 'idle',
    resumeLegAfterDetour: null,
    checkoutStatus: 'idle',
    receipt: null,
    kakaoPaySession: null,
    recentlyRecommendedBookIds: [],
    recommendationDiversityRound: 0,
    pendingConfirmation: null,
    lastToolResult: null,
    ...overrides,
  }
}

describe('useTransitSerendipityDetour', () => {
  beforeEach(() => {
    resetStickyMapCommandsForTest()
  })

  afterEach(() => {
    resetStickyMapCommandsForTest()
  })

  it('enters paused_for_follow on PAUSE_MOBILITY during leg0 transit', () => {
    const contextRef = { current: makeContext() }
    const setContext = vi.fn((patch: Partial<AgentContext>) => {
      contextRef.current = { ...contextRef.current, ...patch }
    })
    const appendAssistant = vi.fn(async () => {})

    renderHook(() =>
      useTransitSerendipityDetour({ contextRef, setContext, appendAssistant }),
    )

    publishNavigationSync({
      version: AGENT_MAP_EVENT_VERSION,
      navigationActive: true,
      mobilityPhase: 'walking',
      activeLeg: 0,
      distanceToGoalM: 5,
      highlightPathLengthM: 10,
      isAutoWalking: true,
      isManualWalking: false,
      isWalkMode: false,
      navigationSpawnReady: true,
      ttsSpeaking: false,
      mobilityHold: false,
    })

    act(() => {
      dispatchPauseMobility()
    })

    expect(setContext).toHaveBeenCalledWith(
      expect.objectContaining({
        transitDetourPhase: 'paused_for_follow',
        resumeLegAfterDetour: 0,
      }),
    )
  })

  it('starts serendipity nav on follow_me when paused_for_follow', () => {
    const contextRef = {
      current: makeContext({ transitDetourPhase: 'paused_for_follow' }),
    }
    const setContext = vi.fn((patch: Partial<AgentContext>) => {
      contextRef.current = { ...contextRef.current, ...patch }
    })
    const appendAssistant = vi.fn(async () => {})

    const goalsReceived: unknown[] = []
    const started: string[] = []
    const mapUnsub = subscribeMapCommand((command) => {
      if (command.type === 'SET_DIRECT_GOALS') goalsReceived.push(command.goals)
      if (command.type === 'START_NAVIGATION') started.push(command.type)
    })

    const { result } = renderHook(() =>
      useTransitSerendipityDetour({ contextRef, setContext, appendAssistant }),
    )

    act(() => {
      const handled = result.current.handleFollowMeDetour()
      expect(handled).toBe(true)
    })

    expect(setContext).toHaveBeenCalledWith(
      expect.objectContaining({ transitDetourPhase: 'serendipity_nav', mobilityPaused: false }),
    )
    expect(goalsReceived.length).toBeGreaterThan(0)
    expect(started).toContain('START_NAVIGATION')

    mapUnsub()
  })

  it('enters serendipity_dwell on serendipity pool arrival during serendipity_nav', () => {
    const contextRef = {
      current: makeContext({ transitDetourPhase: 'serendipity_nav' }),
    }
    const setContext = vi.fn((patch: Partial<AgentContext>) => {
      contextRef.current = { ...contextRef.current, ...patch }
    })
    const appendAssistant = vi.fn(async () => {})

    renderHook(() =>
      useTransitSerendipityDetour({ contextRef, setContext, appendAssistant }),
    )

    act(() => {
      dispatchDwellEvent({
        type: 'SHELF_ARRIVED',
        version: AGENT_MAP_EVENT_VERSION,
        legIndex: 0,
        poolIndex: SERENDIPITY_BROWSE_POOL_INDEX,
      })
    })

    expect(setContext).toHaveBeenCalledWith(
      expect.objectContaining({
        transitDetourPhase: 'serendipity_dwell',
        awaitingDwellFeedback: true,
      }),
    )
    expect(appendAssistant).toHaveBeenCalled()
  })
})
