import type { Point2 } from '../../data/floorPlan'
import type { NavigationMobilityPhase } from '../../types/navigationMobility'
import type { DwellBookCandidate } from '../types'

/** Event bus schema version (W18). */
export const AGENT_MAP_EVENT_VERSION = 1

export type AgentMapCommand =
  | { type: 'REPLAN_SHORTEST'; version: number }
  | { type: 'START_NAVIGATION'; version: number }
  | { type: 'PAUSE_MOBILITY'; version: number }
  | { type: 'RESUME_MOBILITY'; version: number }
  | { type: 'GO_CHECKOUT'; version: number }
  | { type: 'SET_DIRECT_GOALS'; version: number; goals: Point2[] }
  | { type: 'PREVIEW_NAV_PLAN'; version: number; goals: Point2[] }

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

/** Movement state for chat/narration sync (W19). */
export type NavigationSyncState = {
  version: number
  navigationActive: boolean
  mobilityPhase: NavigationMobilityPhase
  activeLeg: number | null
  distanceToGoalM: number | null
  highlightPathLengthM: number | null
  isAutoWalking: boolean
  isManualWalking: boolean
  isWalkMode: boolean
  navigationSpawnReady: boolean
  ttsSpeaking: boolean
  /** True while destination arrival guidance TTS is playing (blocks mobility). */
  mobilityHold: boolean
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

const MAP_COMMAND_EVENT = 'agent:map-command'

const STICKY_MAP_COMMAND_TYPES = new Set<AgentMapCommand['type']>([
  'PREVIEW_NAV_PLAN',
  'START_NAVIGATION',
])

let stickyMapCommands: AgentMapCommand[] = []

function updateStickyMapCommands(command: AgentMapCommand): void {
  if (!STICKY_MAP_COMMAND_TYPES.has(command.type)) return

  if (command.type === 'PREVIEW_NAV_PLAN') {
    stickyMapCommands = stickyMapCommands.filter((c) => c.type !== 'START_NAVIGATION')
  }
  if (command.type === 'START_NAVIGATION') {
    stickyMapCommands = stickyMapCommands.filter(
      (c) => c.type !== 'PREVIEW_NAV_PLAN',
    )
  }

  stickyMapCommands = stickyMapCommands.filter((c) => c.type !== command.type)
  stickyMapCommands.push(command)
}

/** Test-only: reset sticky replay state between tests. */
export function resetStickyMapCommandsForTest(): void {
  stickyMapCommands = []
}

const mapCommandBus = createTypedBusEvent<AgentMapCommand>(MAP_COMMAND_EVENT)
const mapSnapshotBus = createTypedBusEvent<AgentMapSnapshot>('agent:map-snapshot')
const navSyncBus = createTypedBusEvent<NavigationSyncState>('agent:nav-sync')
const dwellEventBus = createTypedBusEvent<AgentDwellEvent>('agent:dwell-event')
const mobilityHoldBus = createTypedBusEvent<boolean>('agent:mobility-hold')

export function dispatchMapCommand(command: AgentMapCommand): void {
  updateStickyMapCommands(command)
  mapCommandBus.dispatch(command)
}

export function subscribeMapCommand(handler: (command: AgentMapCommand) => void): () => void {
  for (const command of stickyMapCommands) {
    handler(command)
  }
  return mapCommandBus.subscribe(handler)
}

export const publishMapSnapshot = mapSnapshotBus.dispatch
export const subscribeMapSnapshot = mapSnapshotBus.subscribe
export const publishNavigationSync = navSyncBus.dispatch
export const subscribeNavigationSync = navSyncBus.subscribe
export const dispatchMobilityHold = mobilityHoldBus.dispatch
export const subscribeMobilityHold = mobilityHoldBus.subscribe
export const dispatchDwellEvent = dwellEventBus.dispatch
export const subscribeDwellEvent = dwellEventBus.subscribe

export function dispatchSetDirectGoals(goals: Point2[]): void {
  dispatchMapCommand({ type: 'SET_DIRECT_GOALS', version: AGENT_MAP_EVENT_VERSION, goals })
}

export function dispatchGoCheckout(): void {
  dispatchMapCommand({ type: 'GO_CHECKOUT', version: AGENT_MAP_EVENT_VERSION })
}

export function dispatchStartNavigation(): void {
  dispatchMapCommand({ type: 'START_NAVIGATION', version: AGENT_MAP_EVENT_VERSION })
}

export function dispatchPreviewNavPlan(goals: Point2[]): void {
  dispatchMapCommand({ type: 'PREVIEW_NAV_PLAN', version: AGENT_MAP_EVENT_VERSION, goals })
}

export function dispatchPauseMobility(): void {
  dispatchMapCommand({ type: 'PAUSE_MOBILITY', version: AGENT_MAP_EVENT_VERSION })
}
