import { useEffect, useRef } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  subscribeDwellEvent,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import { DEMO_BOOKS } from '../data/demoScenario'
import { resolveFixtureBookForShelfArrival } from '../data/fixtureRobotRoute'
import type { PipelineItem } from './chatAgent/assistantOutputPipeline'
import { buildBookArrivalBriefItems } from './chatAgent/bookArrivalBrief'
import { claimArrivalEvent } from '../utils/arrivalDedupe'

export type UseFixtureShelfArrivalBriefDeps = {
  enqueueAssistantMany: (items: PipelineItem[]) => Promise<void>
}

export function useFixtureShelfArrivalBrief(deps: UseFixtureShelfArrivalBriefDeps): void {
  const depsRef = useRef(deps)
  const navigationRunIdRef = useRef(0)
  const processedArrivalKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  useEffect(() => {
    return subscribeMapCommand((command) => {
      if (command.type !== 'START_NAVIGATION') return
      navigationRunIdRef.current += 1
      processedArrivalKeysRef.current.clear()
    })
  }, [])

  useEffect(() => {
    return subscribeDwellEvent((event) => {
      if (event.version !== AGENT_MAP_EVENT_VERSION) return
      if (event.type !== 'SHELF_ARRIVED') return

      const claimed = claimArrivalEvent(
        processedArrivalKeysRef.current,
        navigationRunIdRef.current,
        event,
      )
      if (!claimed) return

      const bookKey = resolveFixtureBookForShelfArrival({
        legIndex: event.legIndex,
        poolIndex: event.poolIndex,
      })
      if (!bookKey) return

      const def = DEMO_BOOKS[bookKey]
      void depsRef.current.enqueueAssistantMany(buildBookArrivalBriefItems(def, event.legIndex))
    })
  }, [])
}
