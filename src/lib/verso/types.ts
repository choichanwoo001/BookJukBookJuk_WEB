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

export type VersoCommandAction = 'stop' | 'resume' | 'go_checkout'
