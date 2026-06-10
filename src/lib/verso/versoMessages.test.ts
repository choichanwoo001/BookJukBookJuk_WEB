import { describe, expect, it } from 'vitest'
import {
  parseVersoEventPayload,
  parseVersoPathPayload,
  parseVersoStatusPayload,
} from './versoMessages'

describe('versoMessages', () => {
  it('parses valid status payloads', () => {
    const status = parseVersoStatusPayload(JSON.stringify({
      type: 'status',
      position: { x: 12.3, y: 4.5, heading: 1.57 },
      current_waypoint_id: 'book_001',
      remaining_waypoints: 2,
      mode: 'escort',
      is_moving: true,
    }))
    expect(status).toEqual({
      x: 12.3,
      y: 4.5,
      heading: 1.57,
      currentWaypointId: 'book_001',
      remainingWaypoints: 2,
      mode: 'escort',
      isMoving: true,
    })
  })

  it('parses null current_waypoint_id', () => {
    const status = parseVersoStatusPayload(JSON.stringify({
      type: 'status',
      position: { x: 0, y: 0, heading: 0 },
      current_waypoint_id: null,
      remaining_waypoints: 0,
      mode: 'guidance',
      is_moving: false,
    }))
    expect(status?.currentWaypointId).toBeNull()
  })

  it('parses valid path payloads', () => {
    const path = parseVersoPathPayload(JSON.stringify({
      type: 'path',
      poses: [{ x: 1.2, y: 3.4 }, { x: 2, y: 4 }],
    }))
    expect(path).toEqual({
      poses: [{ x: 1.2, y: 3.4 }, { x: 2, y: 4 }],
    })
  })

  it('parses valid event payloads', () => {
    const event = parseVersoEventPayload(JSON.stringify({
      type: 'event',
      event: 'waypoint_arrived',
      waypoint_id: 'book_001',
      label: '채식주의자',
    }))
    expect(event).toEqual({
      event: 'waypoint_arrived',
      waypointId: 'book_001',
      label: '채식주의자',
    })
  })

  it('ignores malformed status JSON', () => {
    expect(parseVersoStatusPayload('not-json')).toBeNull()
    expect(parseVersoStatusPayload(JSON.stringify({ type: 'status' }))).toBeNull()
    expect(parseVersoStatusPayload(JSON.stringify({
      type: 'status',
      position: { x: 'bad', y: 1, heading: 0 },
      remaining_waypoints: 0,
      mode: 'guidance',
      is_moving: false,
    }))).toBeNull()
  })

  it('ignores malformed path JSON', () => {
    expect(parseVersoPathPayload(JSON.stringify({ type: 'path', poses: [{ x: 1 }] }))).toBeNull()
    expect(parseVersoPathPayload(JSON.stringify({ type: 'event' }))).toBeNull()
  })

  it('ignores malformed event JSON', () => {
    expect(parseVersoEventPayload(JSON.stringify({ type: 'event' }))).toBeNull()
    expect(parseVersoEventPayload('{')).toBeNull()
  })
})
