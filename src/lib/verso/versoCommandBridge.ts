import type { VersoCommandAction, VersoConnectionState, VersoSetModeAction, VersoWaypoint } from './types'

type PublishFn = (action: VersoCommandAction) => boolean
type SetModeFn = (mode: VersoSetModeAction) => boolean
type WaypointsFn = (waypoints: VersoWaypoint[]) => boolean

let publishFn: PublishFn | null = null
let setModeFn: SetModeFn | null = null
let waypointsFn: WaypointsFn | null = null
let connectionState: VersoConnectionState = 'disconnected'
let robotSyncActive = false
const bridgeListeners = new Set<() => void>()

function notifyVersoCommandBridgeListeners(): void {
  for (const listener of bridgeListeners) {
    listener()
  }
}

export function subscribeVersoCommandBridge(listener: () => void): () => void {
  bridgeListeners.add(listener)
  return () => {
    bridgeListeners.delete(listener)
  }
}

export function registerVersoCommandBridge(
  state: VersoConnectionState,
  syncActive: boolean,
  publish: PublishFn | null,
  setMode?: SetModeFn | null,
  waypoints?: WaypointsFn | null,
): void {
  connectionState = state
  robotSyncActive = syncActive
  publishFn = publish
  setModeFn = setMode ?? null
  waypointsFn = waypoints ?? null
  notifyVersoCommandBridgeListeners()
}

export function getVersoConnectionState(): VersoConnectionState {
  return connectionState
}

export function isVersoRobotSyncActive(): boolean {
  return robotSyncActive
}

function canPublishToRobot(): boolean {
  return connectionState === 'connected' && robotSyncActive
}

export function tryPublishVersoCommand(action: VersoCommandAction): boolean {
  if (!canPublishToRobot() || !publishFn) return false
  return publishFn(action)
}

export function tryPublishVersoSetMode(mode: VersoSetModeAction): boolean {
  if (!canPublishToRobot() || !setModeFn) return false
  return setModeFn(mode)
}

export function tryPublishVersoWaypoints(waypoints: VersoWaypoint[]): boolean {
  if (!canPublishToRobot() || !waypointsFn) return false
  return waypointsFn(waypoints)
}
