import { describe, expect, it } from 'vitest'
import {
  buildPublishString,
  buildSubscribe,
  buildVersoCommandPayload,
  parseRosbridgePublish,
} from './rosbridgeProtocol'

describe('rosbridgeProtocol', () => {
  it('builds subscribe messages', () => {
    const raw = buildSubscribe('/verso/status')
    expect(JSON.parse(raw)).toEqual({
      op: 'subscribe',
      topic: '/verso/status',
      type: 'std_msgs/String',
    })
  })

  it('builds publish messages for std_msgs/String', () => {
    const payload = buildVersoCommandPayload('stop')
    const raw = buildPublishString('/verso/command', payload)
    expect(JSON.parse(raw)).toEqual({
      op: 'publish',
      topic: '/verso/command',
      msg: { data: '{"type":"command","action":"stop"}' },
    })
  })

  it('builds resume command payload', () => {
    expect(buildVersoCommandPayload('resume')).toBe('{"type":"command","action":"resume"}')
  })

  it('parses rosbridge publish frames', () => {
    const parsed = parseRosbridgePublish({
      op: 'publish',
      topic: '/verso/status',
      msg: { data: '{"type":"status"}' },
    })
    expect(parsed).toEqual({
      topic: '/verso/status',
      payload: '{"type":"status"}',
    })
  })

  it('ignores non-publish frames', () => {
    expect(parseRosbridgePublish({ op: 'subscribe', topic: '/verso/status' })).toBeNull()
    expect(parseRosbridgePublish(null)).toBeNull()
    expect(parseRosbridgePublish({ op: 'publish', topic: '/verso/status', msg: {} })).toBeNull()
  })
})
