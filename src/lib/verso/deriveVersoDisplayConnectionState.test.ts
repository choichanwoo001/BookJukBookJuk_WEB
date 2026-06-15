import { describe, expect, it } from 'vitest'
import { deriveVersoDisplayConnectionState } from './deriveVersoDisplayConnectionState'
import type { VersoStatus } from './types'

const sampleStatus: VersoStatus = {
  x: 1,
  y: 2,
  heading: 0,
  mode: 'guidance',
  isMoving: false,
  currentWaypointId: null,
  remainingWaypoints: 0,
}

describe('deriveVersoDisplayConnectionState', () => {
  it('shows disconnected when mock backend is active (no activeUrl)', () => {
    expect(deriveVersoDisplayConnectionState(null, 'connected', sampleStatus)).toBe('disconnected')
    expect(deriveVersoDisplayConnectionState('  ', 'connected', sampleStatus)).toBe('disconnected')
  })

  it('shows connecting when WS is open but no /verso/status yet', () => {
    expect(deriveVersoDisplayConnectionState('ws://127.0.0.1:9090', 'connected', null)).toBe(
      'connecting',
    )
  })

  it('shows connected when rosbridge URL is set and status received', () => {
    expect(
      deriveVersoDisplayConnectionState('ws://192.168.0.10:9090', 'connected', sampleStatus),
    ).toBe('connected')
  })

  it('passes through non-connected transport states', () => {
    expect(deriveVersoDisplayConnectionState('ws://127.0.0.1:9090', 'connecting', null)).toBe(
      'connecting',
    )
    expect(deriveVersoDisplayConnectionState('ws://127.0.0.1:9090', 'error', null)).toBe('error')
    expect(deriveVersoDisplayConnectionState('ws://127.0.0.1:9090', 'disconnected', null)).toBe(
      'disconnected',
    )
  })
})
