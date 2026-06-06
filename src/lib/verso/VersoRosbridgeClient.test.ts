import { afterEach, describe, expect, it, vi } from 'vitest'
import { VersoRosbridgeClient } from './VersoRosbridgeClient'
import type { VersoPath, VersoStatus } from './types'

type MockWebSocketInstance = {
  url: string
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  sent: string[]
  close: ReturnType<typeof vi.fn>
}

const OPEN = 1

function createMockWebSocketFactory() {
  const instances: MockWebSocketInstance[] = []

  const factory = (url: string) => {
    const ws: MockWebSocketInstance = {
      url,
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      sent: [],
      close: vi.fn(() => {
        ws.readyState = 3
        ws.onclose?.()
      }),
    }
    Object.defineProperty(ws, 'send', {
      value: (data: string) => {
        ws.sent.push(data)
      },
    })
    Object.defineProperty(ws, 'OPEN', { value: OPEN })
    instances.push(ws)
    return ws as unknown as WebSocket
  }

  return { factory, instances }
}

function openLatest(instances: MockWebSocketInstance[]) {
  const ws = instances[instances.length - 1]
  ws.readyState = OPEN
  ws.onopen?.()
  return ws
}

function publishStatus(ws: MockWebSocketInstance, status: Partial<VersoStatus> & { x: number; y: number; heading: number }) {
  ws.onmessage?.({
    data: JSON.stringify({
      op: 'publish',
      topic: '/verso/status',
      msg: {
        data: JSON.stringify({
          type: 'status',
          position: { x: status.x, y: status.y, heading: status.heading },
          current_waypoint_id: status.currentWaypointId ?? null,
          remaining_waypoints: status.remainingWaypoints ?? 0,
          mode: status.mode ?? 'escort',
          is_moving: status.isMoving ?? true,
        }),
      },
    }),
  })
}

function publishPath(ws: MockWebSocketInstance, path: VersoPath) {
  ws.onmessage?.({
    data: JSON.stringify({
      op: 'publish',
      topic: '/verso/path',
      msg: { data: JSON.stringify({ type: 'path', poses: path.poses }) },
    }),
  })
}

describe('VersoRosbridgeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes to verso topics on connect', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const client = new VersoRosbridgeClient({}, factory)
    client.connect('ws://127.0.0.1:9090')
    const ws = openLatest(instances)

    expect(ws.sent).toHaveLength(3)
    const subs = ws.sent.map((s) => JSON.parse(s))
    expect(subs.map((s) => s.topic)).toEqual([
      '/verso/status',
      '/verso/path',
      '/verso/event',
    ])
  })

  it('delivers sequential status updates to handler', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const statuses: VersoStatus[] = []
    const client = new VersoRosbridgeClient({ onStatus: (s) => statuses.push(s) }, factory)
    client.connect('ws://127.0.0.1:9090')
    const ws = openLatest(instances)

    publishStatus(ws, { x: 1, y: 2, heading: 0.1 })
    publishStatus(ws, { x: 3, y: 4, heading: 0.2 })

    expect(statuses).toHaveLength(2)
    expect(statuses[0].x).toBe(1)
    expect(statuses[1].x).toBe(3)
  })

  it('publishes stop/resume commands', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const client = new VersoRosbridgeClient({}, factory)
    client.connect('ws://127.0.0.1:9090')
    const ws = openLatest(instances)

    expect(client.publishCommand('stop')).toBe(true)
    expect(client.publishCommand('resume')).toBe(true)

    const publishes = ws.sent.slice(3).map((s) => JSON.parse(s))
    expect(publishes[0]).toEqual({
      op: 'publish',
      topic: '/verso/command',
      msg: { data: '{"type":"command","action":"stop"}' },
    })
    expect(publishes[1].msg.data).toBe('{"type":"command","action":"resume"}')
  })

  it('ignores malformed status messages', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const statuses: VersoStatus[] = []
    const client = new VersoRosbridgeClient({ onStatus: (s) => statuses.push(s) }, factory)
    client.connect('ws://127.0.0.1:9090')
    const ws = openLatest(instances)

    ws.onmessage?.({
      data: JSON.stringify({
        op: 'publish',
        topic: '/verso/status',
        msg: { data: '{"type":"status","position":{"x":"bad"}}' },
      }),
    })

    expect(statuses).toHaveLength(0)
  })

  it('delivers path messages', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const paths: VersoPath[] = []
    const client = new VersoRosbridgeClient({ onPath: (p) => paths.push(p) }, factory)
    client.connect('ws://127.0.0.1:9090')
    const ws = openLatest(instances)

    publishPath(ws, { poses: [{ x: 1, y: 2 }] })
    expect(paths).toHaveLength(1)
    expect(paths[0].poses[0]).toEqual({ x: 1, y: 2 })
  })

  it('disconnect resets to disconnected state', () => {
    const { factory, instances } = createMockWebSocketFactory()
    const states: string[] = []
    const client = new VersoRosbridgeClient({
      onConnectionState: (s) => states.push(s),
    }, factory)
    client.connect('ws://127.0.0.1:9090')
    openLatest(instances)
    client.disconnect()
    expect(states).toContain('connected')
    expect(states[states.length - 1]).toBe('disconnected')
    expect(instances[0].close).toHaveBeenCalled()
  })
})
