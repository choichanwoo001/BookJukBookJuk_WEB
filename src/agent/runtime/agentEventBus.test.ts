import { describe, expect, it } from 'vitest'
import { dispatchSetMission } from './agentEventBus'

describe('agentEventBus SET_MISSION', () => {
  it('dispatches SET_MISSION to subscribers', () => {
    const received: number[] = []
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; poolIndices: number[] }>).detail
      if (detail.type === 'SET_MISSION') received.push(...detail.poolIndices)
    }
    window.addEventListener('agent:map-command', handler)
    dispatchSetMission([0, 2])
    window.removeEventListener('agent:map-command', handler)
    expect(received).toEqual([0, 2])
  })
})
