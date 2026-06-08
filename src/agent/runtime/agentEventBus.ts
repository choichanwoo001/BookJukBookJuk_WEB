import type { Point2 } from '../../data/floorPlan'
import type { DwellBookCandidate } from '../types'

/** Event bus schema version (W18). */
export const AGENT_MAP_EVENT_VERSION = 1

export type AgentMapCommand =
  | { type: 'REPLAN_SHORTEST'; version: number }
  | { type: 'PAUSE_MOBILITY'; version: number }
  | { type: 'RESUME_MOBILITY'; version: number }
  | { type: 'GO_CHECKOUT'; version: number }
  | { type: 'SET_MISSION'; version: number; poolIndices: number[] }
  | { type: 'SET_DIRECT_GOALS'; version: number; goals: Point2[] }

export type AgentDwellEvent =
  | { type: 'DWELL_BOOK_DETECTED'; version: number; book: DwellBookCandidate }
  | { type: 'CHECKOUT_ARRIVED'; version: number }
  | { type: 'SHELF_ARRIVED'; version: number; legIndex: number; poolIndex: number | null }

export type AgentMapSnapshot = {
  version: number
  playerXz: Point2 | null
  missionVersion: number
  activeLeg: number | null
  arrivedLeg: number | null
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
const dwellEventBus = createTypedBusEvent<AgentDwellEvent>('agent:dwell-event')

export const dispatchMapCommand = mapCommandBus.dispatch
export const subscribeMapCommand = mapCommandBus.subscribe
export const publishMapSnapshot = mapSnapshotBus.dispatch
export const subscribeMapSnapshot = mapSnapshotBus.subscribe
export const dispatchDwellEvent = dwellEventBus.dispatch
export const subscribeDwellEvent = dwellEventBus.subscribe

export function dispatchSetMission(poolIndices: number[]): void {
  dispatchMapCommand({ type: 'SET_MISSION', version: AGENT_MAP_EVENT_VERSION, poolIndices })
}

export function dispatchSetDirectGoals(goals: Point2[]): void {
  dispatchMapCommand({ type: 'SET_DIRECT_GOALS', version: AGENT_MAP_EVENT_VERSION, goals })
}

export function dispatchGoCheckout(): void {
  dispatchMapCommand({ type: 'GO_CHECKOUT', version: AGENT_MAP_EVENT_VERSION })
}
