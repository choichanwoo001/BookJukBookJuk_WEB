import {
  buildPublishString,
  buildSubscribe,
  buildVersoCommandPayload,
  parseRosbridgePublish,
} from './rosbridgeProtocol'
import type { VersoCommandAction, VersoConnectionState, VersoEvent, VersoPath, VersoStatus } from './types'
import {
  parseVersoEventPayload,
  parseVersoPathPayload,
  parseVersoStatusPayload,
  VERSO_TOPICS,
} from './versoMessages'

export type VersoRosbridgeClientHandlers = {
  onConnectionState?: (state: VersoConnectionState) => void
  onStatus?: (status: VersoStatus) => void
  onPath?: (path: VersoPath) => void
  onEvent?: (event: VersoEvent) => void
}

type WebSocketFactory = (url: string) => WebSocket

const DEFAULT_WS_FACTORY: WebSocketFactory = (url) => new WebSocket(url)

export class VersoRosbridgeClient {
  private ws: WebSocket | null = null
  private url = ''
  private connectionState: VersoConnectionState = 'disconnected'
  private handlers: VersoRosbridgeClientHandlers = {}
  private readonly createWebSocket: WebSocketFactory

  constructor(
    handlers: VersoRosbridgeClientHandlers = {},
    createWebSocket: WebSocketFactory = DEFAULT_WS_FACTORY,
  ) {
    this.handlers = handlers
    this.createWebSocket = createWebSocket
  }

  setHandlers(handlers: VersoRosbridgeClientHandlers): void {
    this.handlers = handlers
  }

  getConnectionState(): VersoConnectionState {
    return this.connectionState
  }

  connect(url: string): void {
    const trimmed = url.trim()
    if (!trimmed) return

    this.disconnect()
    this.url = trimmed
    this.setConnectionState('connecting')

    const ws = this.createWebSocket(trimmed)
    this.ws = ws

    ws.onopen = () => {
      if (this.ws !== ws) return
      this.setConnectionState('connected')
      ws.send(buildSubscribe(VERSO_TOPICS.status))
      ws.send(buildSubscribe(VERSO_TOPICS.path))
      ws.send(buildSubscribe(VERSO_TOPICS.event))
    }

    ws.onmessage = (event) => {
      if (this.ws !== ws) return
      this.handleMessage(event.data)
    }

    ws.onerror = () => {
      if (this.ws !== ws) return
      this.setConnectionState('error')
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.setConnectionState('disconnected')
    }
  }

  disconnect(): void {
    const ws = this.ws
    this.ws = null
    this.url = ''
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
    this.setConnectionState('disconnected')
  }

  reconnect(): void {
    if (!this.url) return
    const url = this.url
    this.disconnect()
    this.connect(url)
  }

  publishCommand(action: VersoCommandAction): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const payload = buildVersoCommandPayload(action)
    ws.send(buildPublishString(VERSO_TOPICS.command, payload))
    return true
  }

  private setConnectionState(state: VersoConnectionState): void {
    if (this.connectionState === state) return
    this.connectionState = state
    this.handlers.onConnectionState?.(state)
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return
    }

    const publish = parseRosbridgePublish(parsed)
    if (!publish) return

    if (publish.topic === VERSO_TOPICS.status) {
      const status = parseVersoStatusPayload(publish.payload)
      if (status) this.handlers.onStatus?.(status)
      return
    }
    if (publish.topic === VERSO_TOPICS.path) {
      const path = parseVersoPathPayload(publish.payload)
      if (path) this.handlers.onPath?.(path)
      return
    }
    if (publish.topic === VERSO_TOPICS.event) {
      const versoEvent = parseVersoEventPayload(publish.payload)
      if (versoEvent) this.handlers.onEvent?.(versoEvent)
    }
  }
}
