import type { Point2 } from '../../data/floorPlan'

/** Event bus schema version (W18). */
export const AGENT_MAP_EVENT_VERSION = 1

export type AgentMapCommand =
  | { type: 'REPLAN_SHORTEST'; version: number }
  | { type: 'PAUSE_MOBILITY'; version: number }
  | { type: 'RESUME_MOBILITY'; version: number }

export type AgentMapSnapshot = {
  version: number
  playerXz: Point2 | null
  missionVersion: number
  activeLeg: number | null
}

type TypedBusEvent<T> = {
  dispatch: (detail: T) => void
  subscribe: (handler: (detail: T) => void) => () => void
}

function createTypedBusEvent<T>(eventName: string): TypedBusEvent<T> {
  return {
    dispatch(detail) {
      window.dispatchEvent(new CustomEvent<T>(eventName, { detail }))
    },
    subscribe(handler) {
      const listener = (event: Event) => {
        const custom = event as CustomEvent<T>
        handler(custom.detail)
      }
      window.addEventListener(eventName, listener)
      return () => window.removeEventListener(eventName, listener)
    },
  }
}

const mapCommandBus = createTypedBusEvent<AgentMapCommand>('agent:map-command')
const mapSnapshotBus = createTypedBusEvent<AgentMapSnapshot>('agent:map-snapshot')

export const dispatchMapCommand = mapCommandBus.dispatch
export const subscribeMapCommand = mapCommandBus.subscribe
export const publishMapSnapshot = mapSnapshotBus.dispatch
export const subscribeMapSnapshot = mapSnapshotBus.subscribe
