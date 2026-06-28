import { useEffect, useRef, type RefObject } from 'react'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchPauseMobility,
  subscribeDwellEvent,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import type { AgentContext } from '../agent/types'
import { isDemoMode } from '../config/demoMode'
import { DEMO_BOOKS, type DemoBookKey } from '../data/demoScenario'
import { resolveFixtureBookForShelfArrival } from '../data/fixtureRobotRoute'
import type { PipelineItem } from './chatAgent/assistantOutputPipeline'
import { buildBookArrivalBriefItems } from './chatAgent/bookArrivalBrief'
import { claimArrivalEvent } from '../utils/arrivalDedupe'

export type UseFixtureShelfArrivalBriefDeps = {
  enqueueAssistantMany: (items: PipelineItem[]) => Promise<void>
  appendAssistant: (text: string) => Promise<void>
  contextRef: RefObject<AgentContext>
  setContext: (patch: Partial<AgentContext>) => void
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

      if (bookKey === 'serendipity') return

      const def = DEMO_BOOKS[bookKey]
      const runDwellDialogue = isDemoMode()

      if (runDwellDialogue) {
        dispatchPauseMobility()
        depsRef.current.setContext({
          dwellDialogueActiveBookKey: bookKey as DemoBookKey,
          dwellDialogueStep: null,
          mobilityPaused: true,
        })
      }

      void (async () => {
        await depsRef.current.enqueueAssistantMany(
          buildBookArrivalBriefItems(def, event.legIndex, {
            holdMobilityAfterBrief: runDwellDialogue,
          }),
        )
        if (!runDwellDialogue) return
        depsRef.current.setContext({ dwellDialogueStep: 'intro' })
        await depsRef.current.appendAssistant(
          `「${def.title}」 서가에 도착했습니다. 책을 한번 보시겠어요? 어떠신가요?`,
        )
      })()
    })
  }, [])
}
