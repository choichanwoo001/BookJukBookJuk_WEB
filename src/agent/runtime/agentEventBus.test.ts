import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchPreviewRoute,
  dispatchStartNavigation,
  resetStickyMapCommandsForTest,
  subscribeMapCommand,
  type AgentMapCommand,
} from './agentEventBus'

describe('agentEventBus START_NAVIGATION', () => {
  afterEach(() => {
    resetStickyMapCommandsForTest()
    vi.restoreAllMocks()
  })

  it('dispatches START_NAVIGATION to subscribers', () => {
    const received: AgentMapCommand[] = []
    const unsubscribe = subscribeMapCommand((command) => {
      received.push(command)
    })

    dispatchStartNavigation()

    expect(received).toEqual([
      { type: 'START_NAVIGATION', version: AGENT_MAP_EVENT_VERSION },
    ])

    unsubscribe()
  })
})

describe('agentEventBus sticky replay', () => {
  afterEach(() => {
    resetStickyMapCommandsForTest()
    vi.restoreAllMocks()
  })

  it('replays PREVIEW_ROUTE to late subscribers', () => {
    const poolIndices = [1, 2, 3]
    dispatchPreviewRoute(poolIndices)

    const received: AgentMapCommand[] = []
    const unsubscribe = subscribeMapCommand((command) => {
      received.push(command)
    })

    expect(received).toEqual([
      { type: 'PREVIEW_ROUTE', version: AGENT_MAP_EVENT_VERSION, poolIndices },
    ])

    unsubscribe()
  })

  it('replays START_NAVIGATION to late subscribers', () => {
    dispatchStartNavigation()

    const received: AgentMapCommand[] = []
    const unsubscribe = subscribeMapCommand((command) => {
      received.push(command)
    })

    expect(received).toEqual([
      { type: 'START_NAVIGATION', version: AGENT_MAP_EVENT_VERSION },
    ])

    unsubscribe()
  })

  it('clears PREVIEW_ROUTE sticky when START_NAVIGATION is dispatched', () => {
    dispatchPreviewRoute([1, 2])
    dispatchStartNavigation()

    const received: AgentMapCommand[] = []
    const unsubscribe = subscribeMapCommand((command) => {
      received.push(command)
    })

    expect(received).toEqual([
      { type: 'START_NAVIGATION', version: AGENT_MAP_EVENT_VERSION },
    ])

    unsubscribe()
  })

  it('clears START_NAVIGATION sticky when PREVIEW_ROUTE is dispatched', () => {
    dispatchStartNavigation()
    dispatchPreviewRoute([4, 5])

    const received: AgentMapCommand[] = []
    const unsubscribe = subscribeMapCommand((command) => {
      received.push(command)
    })

    expect(received).toEqual([
      { type: 'PREVIEW_ROUTE', version: AGENT_MAP_EVENT_VERSION, poolIndices: [4, 5] },
    ])

    unsubscribe()
  })
})
