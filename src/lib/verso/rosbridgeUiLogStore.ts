import type {
  VersoCommandAction,
  VersoEvent,
  VersoPath,
  VersoSetModeAction,
  VersoStatus,
  VersoWaypoint,
} from './types'

export type RosbridgeUiLogDirection = 'incoming' | 'outgoing'

export type RosbridgeUiLogKind =
  | 'status'
  | 'path'
  | 'event'
  | 'command'
  | 'waypoints'
  | 'connection'
  | 'mission'

export type RosbridgeUiLogEntry = {
  id: number
  at: number
  direction: RosbridgeUiLogDirection
  kind: RosbridgeUiLogKind
  topic?: string
  summary: string
  detail?: string
}

const MAX_ENTRIES_PER_SIDE = 400
const DEV_ENTRY_ENDPOINT = '/verso-rosbridge-log/entry'

type Listener = () => void

let nextId = 1
let incoming: RosbridgeUiLogEntry[] = []
let outgoing: RosbridgeUiLogEntry[] = []
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

function forwardToDevHub(entry: RosbridgeUiLogEntry): void {
  if (!import.meta.env.DEV) return
  void fetch(DEV_ENTRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: entry.direction,
      kind: entry.kind,
      topic: entry.topic,
      summary: entry.summary,
      detail: entry.detail,
      at: entry.at,
    }),
  }).catch(() => {})
}

function append(entry: Omit<RosbridgeUiLogEntry, 'id' | 'at'> & { at?: number }): void {
  const full: RosbridgeUiLogEntry = {
    id: nextId,
    at: entry.at ?? Date.now(),
    ...entry,
  }
  nextId += 1

  if (entry.direction === 'incoming') {
    incoming = [...incoming, full].slice(-MAX_ENTRIES_PER_SIDE)
  } else {
    outgoing = [...outgoing, full].slice(-MAX_ENTRIES_PER_SIDE)
  }
  forwardToDevHub(full)
  notify()
}

export function subscribeRosbridgeUiLog(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRosbridgeUiLogSnapshot(): {
  incoming: RosbridgeUiLogEntry[]
  outgoing: RosbridgeUiLogEntry[]
} {
  return { incoming, outgoing }
}

export function clearRosbridgeUiLog(): void {
  incoming = []
  outgoing = []
  notify()
}

export function recordUiIncomingStatus(status: VersoStatus): void {
  const wp = status.currentWaypointId ?? '—'
  append({
    direction: 'incoming',
    kind: 'status',
    topic: '/verso/status',
    summary:
      `pos (${status.x.toFixed(3)}, ${status.y.toFixed(3)}) · heading ${status.heading.toFixed(3)} · ` +
      `${status.mode} · moving=${status.isMoving} · wp=${wp} · remaining=${status.remainingWaypoints}`,
    detail: JSON.stringify(status),
  })
}

export function recordUiIncomingPath(path: VersoPath): void {
  const n = path.poses.length
  if (n === 0) {
    append({
      direction: 'incoming',
      kind: 'path',
      topic: '/verso/path',
      summary: 'empty path',
    })
    return
  }
  const first = path.poses[0]
  const last = path.poses[n - 1]
  append({
    direction: 'incoming',
    kind: 'path',
    topic: '/verso/path',
    summary: `${n} poses · start (${first.x.toFixed(2)}, ${first.y.toFixed(2)}) → end (${last.x.toFixed(2)}, ${last.y.toFixed(2)})`,
    detail: JSON.stringify(path),
  })
}

export function recordUiIncomingEvent(event: VersoEvent): void {
  const parts = [event.event]
  if (event.waypointId) parts.push(`wp=${event.waypointId}`)
  if (event.label) parts.push(`label=${event.label}`)
  append({
    direction: 'incoming',
    kind: 'event',
    topic: '/verso/event',
    summary: parts.join(' · '),
    detail: JSON.stringify(event),
  })
}

export function recordUiOutgoingCommand(action: VersoCommandAction | VersoSetModeAction): void {
  if (action === 'guidance' || action === 'escort') {
    append({
      direction: 'outgoing',
      kind: 'command',
      topic: '/verso/command',
      summary: `set_mode → ${action}`,
      detail: JSON.stringify({ type: 'command', action: 'set_mode', mode: action }),
    })
    return
  }
  append({
    direction: 'outgoing',
    kind: 'command',
    topic: '/verso/command',
    summary: `command → ${action}`,
    detail: JSON.stringify({ type: 'command', action }),
  })
}

export function recordUiOutgoingWaypoints(waypoints: VersoWaypoint[]): void {
  const summary = waypoints
    .map((wp, i) => `${i + 1}.${wp.label ?? wp.id}(${wp.x.toFixed(2)},${wp.y.toFixed(2)})`)
    .join(' → ')
  append({
    direction: 'outgoing',
    kind: 'waypoints',
    topic: '/verso/waypoints',
    summary: `${waypoints.length}곳 · ${summary}`,
    detail: JSON.stringify({ type: 'waypoints', waypoints }),
  })
}

export function recordUiConnectionMessage(message: string): void {
  append({
    direction: 'incoming',
    kind: 'connection',
    summary: message.replace(/^\[verso-rosbridge\]\s*/, ''),
  })
}

export function recordUiMissionMessage(message: string): void {
  append({
    direction: 'outgoing',
    kind: 'mission',
    summary: message.replace(/^\[verso-rosbridge\]\s*/, ''),
  })
}
