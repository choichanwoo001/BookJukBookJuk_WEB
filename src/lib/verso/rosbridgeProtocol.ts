import type { VersoCommandAction } from './types'

const STRING_MSG_TYPE = 'std_msgs/String'

export function buildSubscribe(topic: string): string {
  return JSON.stringify({
    op: 'subscribe',
    topic,
    type: STRING_MSG_TYPE,
  })
}

export function buildPublishString(topic: string, jsonString: string): string {
  return JSON.stringify({
    op: 'publish',
    topic,
    msg: { data: jsonString },
  })
}

export function buildVersoCommandPayload(action: VersoCommandAction): string {
  return JSON.stringify({ type: 'command', action })
}

export type RosbridgePublish = {
  topic: string
  payload: string
}

export function parseRosbridgePublish(data: unknown): RosbridgePublish | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.op !== 'publish') return null
  if (typeof record.topic !== 'string') return null
  const msg = record.msg
  if (!msg || typeof msg !== 'object') return null
  const payload = (msg as Record<string, unknown>).data
  if (typeof payload !== 'string') return null
  return { topic: record.topic, payload }
}
