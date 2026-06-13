import {
  AGENT_MAP_EVENT_VERSION,
  subscribeDwellEvent,
  subscribeNavigationSync,
  type AgentDwellEvent,
  type NavigationSyncState,
} from '../../agent/runtime/agentEventBus'
import { isEnRoute } from '../../types/navigationMobility'

export type OutputGate =
  | { kind: 'immediate' }
  | { kind: 'after_nav_ready' }
  | { kind: 'on_walk_started'; leg: number }
  | { kind: 'on_shelf_arrived'; leg: number }
  | { kind: 'on_checkout_arrived' }

export type PipelineItem = {
  text: string
  attachments?: string[]
  gate: OutputGate
  narrate?: boolean
}

type QueuedItem = PipelineItem & {
  onComplete?: () => void
}

export type AssistantOutputPipelineDeps = {
  appendAssistant: (text: string, attachments?: string[]) => Promise<void>
  speakAndWait: (text: string) => Promise<void>
  isTtsEnabled: () => boolean
  onTtsSpeakingChange?: (speaking: boolean) => void
}

type PendingArrival = { kind: 'shelf'; leg: number } | { kind: 'checkout' }

function gateMatches(
  gate: OutputGate,
  sync: NavigationSyncState,
  pendingArrivals: PendingArrival[],
  enRouteLegs: Set<number>,
): boolean {
  switch (gate.kind) {
    case 'immediate':
      return true
    case 'after_nav_ready':
      return sync.navigationSpawnReady && sync.mobilityPhase !== 'calculating'
    case 'on_walk_started':
      return enRouteLegs.has(gate.leg)
    case 'on_shelf_arrived':
      return pendingArrivals.some((a) => a.kind === 'shelf' && a.leg === gate.leg)
    case 'on_checkout_arrived':
      return pendingArrivals.some((a) => a.kind === 'checkout')
    default:
      return false
  }
}

function consumeArrivalGate(gate: OutputGate, pendingArrivals: PendingArrival[]): void {
  if (gate.kind === 'on_shelf_arrived') {
    const idx = pendingArrivals.findIndex((a) => a.kind === 'shelf' && a.leg === gate.leg)
    if (idx >= 0) pendingArrivals.splice(idx, 1)
  }
  if (gate.kind === 'on_checkout_arrived') {
    const idx = pendingArrivals.findIndex((a) => a.kind === 'checkout')
    if (idx >= 0) pendingArrivals.splice(idx, 1)
  }
}

function trackWalkStarted(
  sync: NavigationSyncState,
  prevEnRoute: boolean,
  enRouteLegs: Set<number>,
): boolean {
  const enRoute = isEnRoute({
    isAutoWalking: sync.isAutoWalking,
    isWalkMode: sync.isWalkMode,
    isManualWalking: sync.isManualWalking,
    distanceToGoalM: sync.distanceToGoalM,
  })
  if (enRoute && !prevEnRoute && sync.activeLeg != null) {
    enRouteLegs.add(sync.activeLeg)
  }
  return enRoute
}

function handleDwellEvent(event: AgentDwellEvent, pendingArrivals: PendingArrival[]): void {
  if (event.type === 'SHELF_ARRIVED') {
    pendingArrivals.push({ kind: 'shelf', leg: event.legIndex })
  }
  if (event.type === 'CHECKOUT_ARRIVED') {
    pendingArrivals.push({ kind: 'checkout' })
  }
}

export function createAssistantOutputPipeline(deps: AssistantOutputPipelineDeps) {
  const queue: QueuedItem[] = []
  let processing = false
  let disposed = false
  let latestSync: NavigationSyncState | null = null
  let prevEnRoute = false
  const enRouteLegs = new Set<number>()
  const pendingArrivals: PendingArrival[] = []

  const tryProcess = () => {
    if (disposed || processing || queue.length === 0) return

    const head = queue[0]
    if (head.gate.kind !== 'immediate' && !latestSync) return
    if (!gateMatches(head.gate, latestSync!, pendingArrivals, enRouteLegs)) return

    processing = true
    const item = queue.shift()!
  consumeArrivalGate(item.gate, pendingArrivals)
    if (item.gate.kind === 'on_walk_started') {
      enRouteLegs.delete(item.gate.leg)
    }

    void (async () => {
      const shouldNarrate = item.narrate !== false && deps.isTtsEnabled()
      let speechHoldActive = false
      if (shouldNarrate) {
        speechHoldActive = true
        deps.onTtsSpeakingChange?.(true)
      }
      try {
        await deps.appendAssistant(item.text, item.attachments)
        if (shouldNarrate) {
          try {
            await deps.speakAndWait(item.text)
          } finally {
            speechHoldActive = false
            deps.onTtsSpeakingChange?.(false)
          }
        }
      } finally {
        if (speechHoldActive) deps.onTtsSpeakingChange?.(false)
        item.onComplete?.()
        processing = false
        tryProcess()
      }
    })()
  }

  const onSync = (sync: NavigationSyncState) => {
    latestSync = sync
    prevEnRoute = trackWalkStarted(sync, prevEnRoute, enRouteLegs)
    tryProcess()
  }

  const onDwell = (event: AgentDwellEvent) => {
    if (event.version !== AGENT_MAP_EVENT_VERSION) return
    handleDwellEvent(event, pendingArrivals)
    tryProcess()
  }

  const unsubSync = subscribeNavigationSync(onSync)
  const unsubDwell = subscribeDwellEvent(onDwell)

  return {
    enqueue(item: PipelineItem): Promise<void> {
      return new Promise((resolve) => {
        queue.push({ ...item, onComplete: resolve })
        tryProcess()
      })
    },
    enqueueMany(items: PipelineItem[]): Promise<void> {
      return new Promise((resolve) => {
        let remaining = items.length
        if (remaining === 0) {
          resolve()
          return
        }
        for (const entry of items) {
          queue.push({
            ...entry,
            onComplete: () => {
              remaining -= 1
              if (remaining <= 0) resolve()
            },
          })
        }
        tryProcess()
      })
    },
    resetNavRun() {
      enRouteLegs.clear()
      pendingArrivals.length = 0
      prevEnRoute = false
      queue.splice(
        0,
        queue.length,
        ...queue.filter((q) => q.gate.kind === 'immediate'),
      )
    },
    dispose() {
      disposed = true
      unsubSync()
      unsubDwell()
      queue.length = 0
    },
    getQueueLength: () => queue.length,
    isProcessing: () => processing,
  }
}

export type AssistantOutputPipeline = ReturnType<typeof createAssistantOutputPipeline>
