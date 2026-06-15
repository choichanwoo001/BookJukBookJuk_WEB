import { VersoRosbridgeClient } from './VersoRosbridgeClient'
import type {
  IRobotBackend,
  RobotBackendHandlers,
  VersoCommandAction,
  VersoConnectionState,
  VersoSetModeAction,
  VersoWaypoint,
} from './types'

/**
 * IRobotBackend implementation that delegates to a real rosbridge WebSocket.
 * Wraps VersoRosbridgeClient — no logic changes, only interface alignment.
 */
export class RosbridgeBackend implements IRobotBackend {
  private readonly client: VersoRosbridgeClient

  constructor() {
    this.client = new VersoRosbridgeClient()
  }

  setHandlers(handlers: RobotBackendHandlers): void {
    this.client.setHandlers({
      onConnectionState: handlers.onConnectionState,
      onStatus: handlers.onStatus,
      onPath: handlers.onPath,
      onEvent: handlers.onEvent,
    })
  }

  publishCommand(action: VersoCommandAction): boolean {
    return this.client.publishCommand(action)
  }

  publishSetMode(mode: VersoSetModeAction): boolean {
    return this.client.publishSetMode(mode)
  }

  publishWaypoints(waypoints: VersoWaypoint[]): boolean {
    return this.client.publishWaypoints(waypoints)
  }

  getConnectionState(): VersoConnectionState {
    return this.client.getConnectionState()
  }

  start(url: string): void {
    this.client.connect(url)
  }

  reconnect(): void {
    this.client.reconnect()
  }

  destroy(): void {
    this.client.disconnect()
  }
}
