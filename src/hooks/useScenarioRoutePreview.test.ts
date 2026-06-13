import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchPauseMobility,
  dispatchStartNavigation,
  resetStickyMapCommandsForTest,
} from '../agent/runtime/agentEventBus'
import type { Point2 } from '../data/floorPlan'
import { useScenarioRoutePreview } from './useScenarioRoutePreview'

describe('useScenarioRoutePreview pause', () => {
  afterEach(() => {
    resetStickyMapCommandsForTest()
    vi.restoreAllMocks()
  })

  it('sets demoMobilityPaused and clears demoNavigationActive on PAUSE_MOBILITY', () => {
    const playerWorldXzRef = { current: null as Point2 | null }
    const setMinimapPlayerPos = vi.fn()
    const startNavigationView = vi.fn()

    const { result } = renderHook(() =>
      useScenarioRoutePreview({
        playerWorldXzRef,
        setMinimapPlayerPos,
        startNavigationView,
      }),
    )

    act(() => {
      dispatchStartNavigation()
    })

    expect(result.current.demoNavigationActive).toBe(true)
    expect(result.current.demoMobilityPaused).toBe(false)

    act(() => {
      dispatchPauseMobility()
    })

    expect(result.current.demoNavigationActive).toBe(false)
    expect(result.current.demoMobilityPaused).toBe(true)
    expect(result.current.scenarioRoutePreviewActive).toBe(false)
  })
})
