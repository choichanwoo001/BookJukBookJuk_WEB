import type { VersoEvent, VersoPath, VersoStatus } from './types'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseJsonPayload(payload: string): unknown | null {
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

export function parseVersoStatusPayload(payload: string): VersoStatus | null {
  const data = parseJsonPayload(payload)
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.type !== 'status') return null
  const position = record.position
  if (!position || typeof position !== 'object') return null
  const pos = position as Record<string, unknown>
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y) || !isFiniteNumber(pos.heading)) return null
  if (typeof record.mode !== 'string') return null
  if (typeof record.is_moving !== 'boolean') return null
  if (!isFiniteNumber(record.remaining_waypoints)) return null

  const waypointId = record.current_waypoint_id
  const currentWaypointId =
    waypointId === null || waypointId === undefined
      ? null
      : typeof waypointId === 'string'
        ? waypointId
        : null

  return {
    x: pos.x,
    y: pos.y,
    heading: pos.heading,
    mode: record.mode,
    isMoving: record.is_moving,
    currentWaypointId,
    remainingWaypoints: record.remaining_waypoints,
  }
}

export function parseVersoPathPayload(payload: string): VersoPath | null {
  const data = parseJsonPayload(payload)
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.type !== 'path') return null
  if (!Array.isArray(record.poses)) return null

  const poses: VersoPath['poses'] = []
  for (const pose of record.poses) {
    if (!pose || typeof pose !== 'object') return null
    const p = pose as Record<string, unknown>
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return null
    poses.push({ x: p.x, y: p.y })
  }

  return { poses }
}

export function parseVersoEventPayload(payload: string): VersoEvent | null {
  const data = parseJsonPayload(payload)
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.type !== 'event') return null
  if (typeof record.event !== 'string') return null

  const event: VersoEvent = { event: record.event }
  if (typeof record.waypoint_id === 'string') event.waypointId = record.waypoint_id
  if (typeof record.label === 'string') event.label = record.label
  return event
}

export const VERSO_TOPICS = {
  status: '/verso/status',
  path: '/verso/path',
  event: '/verso/event',
  command: '/verso/command',
} as const
