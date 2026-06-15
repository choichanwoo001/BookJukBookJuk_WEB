export type VersoConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type VersoStatus = {
  x: number
  y: number
  heading: number
  mode: string
  isMoving: boolean
  currentWaypointId: string | null
  remainingWaypoints: number
}

export type VersoPath = {
  poses: Array<{ x: number; y: number }>
}

export type VersoEvent = {
  event: string
  waypointId?: string
  label?: string
}

export type VersoCommandAction = 'stop' | 'resume'

export type VersoSetModeAction = 'guidance' | 'escort'

export type VersoWaypoint = {
  id: string
  x: number
  y: number
  label?: string
}

export type RobotBackendHandlers = {
  onConnectionState?: (state: VersoConnectionState) => void
  onStatus?: (status: VersoStatus) => void
  onPath?: (path: VersoPath) => void
  onEvent?: (event: VersoEvent) => void
}

export interface IRobotBackend {
  setHandlers(handlers: RobotBackendHandlers): void
  publishCommand(action: VersoCommandAction): boolean
  publishSetMode(mode: VersoSetModeAction): boolean
  publishWaypoints(waypoints: VersoWaypoint[]): boolean
  getConnectionState(): VersoConnectionState
  /** Start the backend. Rosbridge: connects to URL. Mock: enters connected state. */
  start(urlOrVoid?: string): void
  /** Tear down connections and stop all loops. */
  destroy(): void
}
