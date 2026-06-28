import {
  buildPublishString,
  buildSubscribe,
  buildVersoCommandPayload,
  buildVersoSetModePayload,
  buildVersoWaypointsPayload,
  parseRosbridgePublish,
} from './rosbridgeProtocol'
import type { VersoCommandAction, VersoConnectionState, VersoEvent, VersoPath, VersoSetModeAction, VersoStatus, VersoWaypoint } from './types'
import {
  logRosbridgeConnectAttempt,
  logRosbridgeConnectClose,
  logRosbridgeConnectError,
  logRosbridgeConnectOpen,
  logRosbridgeConnectReady,
  logRosbridgeIncomingEvent,
  logRosbridgeIncomingPath,
  logRosbridgeIncomingStatus,
  logRosbridgeInvalidUrl,
  logRosbridgeOutgoingCommand,
  logRosbridgeOutgoingWaypoints,
  logRosbridgeStatusTimeout,
  validateRosbridgeUrl,
} from './rosbridgeConnectionLog'
import {
  parseVersoEventPayload,
  parseVersoPathPayload,
  parseVersoStatusPayload,
  VERSO_TOPICS,
} from './versoMessages'

const STATUS_WAIT_MS = 10_000

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
  private connectAttempt = 0
  private intentionalClose = false
  private statusWaitTimer: ReturnType<typeof setTimeout> | null = null
  private hasReceivedStatus = false

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

    const urlError = validateRosbridgeUrl(trimmed)
    if (urlError) {
      logRosbridgeInvalidUrl(trimmed, urlError)
      this.setConnectionState('error')
      return
    }

    this.teardownSocket(true)
    this.url = trimmed
    this.hasReceivedStatus = false
    this.connectAttempt += 1
    logRosbridgeConnectAttempt(trimmed, this.connectAttempt)
    this.setConnectionState('connecting')

    const ws = this.createWebSocket(trimmed)
    this.ws = ws

    ws.onopen = () => {
      if (this.ws !== ws) return
      logRosbridgeConnectOpen(trimmed)
      this.setConnectionState('connected')
      this.startStatusWaitTimer(trimmed)
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
      logRosbridgeConnectError(trimmed)
      this.setConnectionState('error')
    }

    ws.onclose = (event) => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearStatusWaitTimer()
      if (!this.intentionalClose) {
        logRosbridgeConnectClose(trimmed, event.code, event.reason, event.wasClean)
        this.setConnectionState('error')
        return
      }
      this.intentionalClose = false
      this.setConnectionState('disconnected')
    }
  }

  disconnect(): void {
    this.teardownSocket(true)
    this.url = ''
    this.setConnectionState('disconnected')
  }

  reconnect(): void {
    if (!this.url) return
    this.connect(this.url)
  }

  publishCommand(action: VersoCommandAction): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const payload = buildVersoCommandPayload(action)
    logRosbridgeOutgoingCommand(action)
    ws.send(buildPublishString(VERSO_TOPICS.command, payload))
    return true
  }

  publishSetMode(mode: VersoSetModeAction): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const payload = buildVersoSetModePayload(mode)
    logRosbridgeOutgoingCommand(mode)
    ws.send(buildPublishString(VERSO_TOPICS.command, payload))
    return true
  }

  publishWaypoints(waypoints: VersoWaypoint[]): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const payload = buildVersoWaypointsPayload(waypoints)
    logRosbridgeOutgoingWaypoints(waypoints)
    ws.send(buildPublishString(VERSO_TOPICS.waypoints, payload))
    return true
  }

  private setConnectionState(state: VersoConnectionState): void {
    if (this.connectionState === state) return
    this.connectionState = state
    this.handlers.onConnectionState?.(state)
  }

  private teardownSocket(intentional: boolean): void {
    this.intentionalClose = intentional
    this.clearStatusWaitTimer()
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }

  private startStatusWaitTimer(url: string): void {
    this.clearStatusWaitTimer()
    this.statusWaitTimer = setTimeout(() => {
      this.statusWaitTimer = null
      if (this.hasReceivedStatus || this.ws === null) return
      logRosbridgeStatusTimeout(url, STATUS_WAIT_MS)
    }, STATUS_WAIT_MS)
  }

  private clearStatusWaitTimer(): void {
    if (this.statusWaitTimer !== null) {
      clearTimeout(this.statusWaitTimer)
      this.statusWaitTimer = null
    }
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
      if (!status) return
      if (!this.hasReceivedStatus) {
        this.hasReceivedStatus = true
        this.clearStatusWaitTimer()
        logRosbridgeConnectReady(this.url)
      }
      logRosbridgeIncomingStatus(status)
      this.handlers.onStatus?.(status)
      return
    }
    if (publish.topic === VERSO_TOPICS.path) {
      const path = parseVersoPathPayload(publish.payload)
      if (!path) return
      logRosbridgeIncomingPath(path)
      this.handlers.onPath?.(path)
      return
    }
    if (publish.topic === VERSO_TOPICS.event) {
      const versoEvent = parseVersoEventPayload(publish.payload)
      if (!versoEvent) return
      logRosbridgeIncomingEvent(versoEvent)
      this.handlers.onEvent?.(versoEvent)
    }
  }
}
