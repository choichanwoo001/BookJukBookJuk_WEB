import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRosbridgeUiLog,
  getRosbridgeUiLogSnapshot,
  recordUiIncomingStatus,
  recordUiOutgoingCommand,
  recordUiOutgoingWaypoints,
} from './rosbridgeUiLogStore'

describe('rosbridgeUiLogStore', () => {
  afterEach(() => {
    clearRosbridgeUiLog()
  })

  it('buffers incoming and outgoing entries separately', () => {
    recordUiIncomingStatus({
      x: 1.2,
      y: 3.4,
      heading: 0.5,
      mode: 'escort',
      isMoving: true,
      currentWaypointId: 'wp_0',
      remainingWaypoints: 2,
    })
    recordUiOutgoingCommand('stop')
    recordUiOutgoingWaypoints([{ id: 'wp_0', x: 1, y: 2, label: '테스트' }])

    const { incoming, outgoing } = getRosbridgeUiLogSnapshot()
    expect(incoming).toHaveLength(1)
    expect(incoming[0]?.kind).toBe('status')
    expect(incoming[0]?.topic).toBe('/verso/status')
    expect(outgoing).toHaveLength(2)
    expect(outgoing[0]?.kind).toBe('command')
    expect(outgoing[1]?.kind).toBe('waypoints')
  })

  it('clears both sides', () => {
    recordUiIncomingStatus({
      x: 0,
      y: 0,
      heading: 0,
      mode: 'idle',
      isMoving: false,
      currentWaypointId: null,
      remainingWaypoints: 0,
    })
    clearRosbridgeUiLog()
    const snap = getRosbridgeUiLogSnapshot()
    expect(snap.incoming).toHaveLength(0)
    expect(snap.outgoing).toHaveLength(0)
  })
})
