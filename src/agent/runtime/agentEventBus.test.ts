import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchStartNavigation,
  subscribeMapCommand,
  type AgentMapCommand,
} from './agentEventBus'

describe('agentEventBus START_NAVIGATION', () => {
  afterEach(() => {
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
