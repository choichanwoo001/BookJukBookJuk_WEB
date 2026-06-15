import { ROBOT_MOCK_UI_STATUS_INTERVAL_MS } from '../../config/constants'
import { ENTRANCE_SPAWN } from '../../data/floorPlan'
import type { Point2 } from '../../data/floorPlan'
import {
  applyMockCommand,
  applyMockSetMode,
  applyMockWaypoints,
  createMockVersoRobotState,
  initialMockStatus,
  tickMockVersoRobot,
  type MockVersoRobotState,
} from './mockVersoRobot'
import type {
  IRobotBackend,
  RobotBackendHandlers,
  VersoCommandAction,
  VersoConnectionState,
  VersoSetModeAction,
  VersoWaypoint,
} from './types'

/**
 * IRobotBackend implementation that simulates a robot in-browser.
 * Wraps the pure mockVersoRobot functions with a rAF loop.
 *
 * Emits onStatus, onPath, onEvent in the same format as RosbridgeBackend
 * so the consuming hook (useRobotBackend) and Map3DView need no special casing.
 */
export class MockRobotBackend implements IRobotBackend {
  private handlers: RobotBackendHandlers = {}
  private state: MockVersoRobotState
  private connectionState: VersoConnectionState = 'disconnected'
  private frameId: number | null = null
  private readonly startPoint: Point2

  constructor(start: Point2 = [ENTRANCE_SPAWN[0], ENTRANCE_SPAWN[1]]) {
    this.startPoint = start
    this.state = createMockVersoRobotState(start)
  }

  setHandlers(handlers: RobotBackendHandlers): void {
    this.handlers = handlers
  }

  /**
   * Enters connected state and emits the initial status.
   * The URL argument is unused — mock has no network transport.
   */
  start(): void {
    this.stopFrame()
    this.state = createMockVersoRobotState(this.startPoint)
    this.connectionState = 'connected'
    this.handlers.onConnectionState?.('connected')
    this.handlers.onStatus?.(initialMockStatus(this.startPoint))
    this.scheduleFrame()
  }

  destroy(): void {
    this.stopFrame()
    this.state = createMockVersoRobotState(this.startPoint)
    this.connectionState = 'disconnected'
    this.handlers.onConnectionState?.('disconnected')
  }

  publishCommand(action: VersoCommandAction): boolean {
    const ok = applyMockCommand(this.state, action)
    this.scheduleFrame()
    return ok
  }

  publishSetMode(mode: VersoSetModeAction): boolean {
    const ok = applyMockSetMode(this.state, mode)
    this.scheduleFrame()
    return ok
  }

  /**
   * Applies a waypoints mission and immediately emits onPath so the route
   * highlight appears in the browser without waiting for the first rAF tick.
   */
  publishWaypoints(waypoints: VersoWaypoint[]): boolean {
    const path = applyMockWaypoints(this.state, waypoints)
    if (path) {
      this.handlers.onPath?.(path)
    }
    this.scheduleFrame()
    return path != null
  }

  getConnectionState(): VersoConnectionState {
    return this.connectionState
  }

  /** Called by useRobotBackend when agentEventBus mobilityHold changes. */
  setMobilityHold(held: boolean): void {
    this.state.mobilityHold = held
    if (held) this.state.paused = true
  }

  private readonly tick = (now: number): void => {
    this.frameId = null
    const result = tickMockVersoRobot(this.state, now, {
      statusIntervalMs: ROBOT_MOCK_UI_STATUS_INTERVAL_MS,
    })

    // Emit events in the same order as real rosbridge would deliver them.
    // onEvent carries waypointId so Map3DView can map to legIndex via wpIdToLegRef.
    if (result.event) this.handlers.onEvent?.(result.event)
    if (result.path) this.handlers.onPath?.(result.path)
    if (result.status) this.handlers.onStatus?.(result.status)

    if (result.shouldContinue) this.scheduleFrame()
  }

  private scheduleFrame(): void {
    if (this.frameId !== null) return
    if (this.connectionState !== 'connected') return
    this.frameId = requestAnimationFrame(this.tick)
  }

  private stopFrame(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
  }
}
