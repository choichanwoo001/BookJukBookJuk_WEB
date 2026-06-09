import { useCallback, useEffect, useRef } from 'react'
import { isDemoMode } from '../config/demoMode'
import {
  DEMO_BOOKS,
  type DemoBookKey,
  type DemoStep,
  demoBookToEntry,
} from '../data/demoScenario'
import type { DwellBookCandidate, ShoppingListEntry, ToolExecutionContext } from '../agent/types'
import {
  subscribeDwellEvent,
  subscribeMapSnapshot,
} from '../agent/runtime/agentEventBus'
import { completeCheckoutPurchase } from '../agent/tools/checkoutCompletion'
import {
  beginDemoNavigationFromShoppingList,
  buildDemoRecommendationToolResult,
  dispatchDemoMissionForKeys,
  initialDemoOrchestratorState,
  maybeAnnounceTransitMonologue,
  runDemoAlternativePick,
  type DemoOrchestratorState,
} from './chatAgent/demoOrchestrator'
import { getBookRecognitionClient } from '../agent/bridges/bookRecognitionBridge'
import { findBookByIsbnOrTitle } from '../lib/supabase/books'

type DemoOrchestratorDeps = {
  toolExecutionContext: ToolExecutionContext
  appendAssistantAndStore: (text: string, attachments?: string[]) => Promise<void>
  setContext: (patch: Partial<import('../agent/types').AgentContext>) => void
}

export function useDemoOrchestrator(deps: DemoOrchestratorDeps) {
  const demoStateRef = useRef<DemoOrchestratorState>(initialDemoOrchestratorState())
  const missionKeysRef = useRef<DemoBookKey[]>([])
  const activeNavBookRef = useRef<{ title: string; authors: string; description?: string } | null>(null)
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  const setDemoStep = useCallback((step: DemoStep) => {
    demoStateRef.current = { ...demoStateRef.current, step }
  }, [])

  const startShelfVisitFromList = useCallback((entries: ShoppingListEntry[]) => {
    if (!isDemoMode()) return
    const keys = beginDemoNavigationFromShoppingList(entries)
    missionKeysRef.current = keys
    demoStateRef.current = { ...demoStateRef.current, step: 'visiting_planned', transitLegAnnounced: -1 }
    activeNavBookRef.current = null
  }, [])

  const handleBrowseCapture = useCallback(async (imageBase64: string) => {
    if (!isDemoMode()) return
    const bridge = getBookRecognitionClient()
    const recognized = await bridge.identifyBook({ reason: 'add', imageBase64 })
    const title = recognized.ok && recognized.title ? recognized.title : DEMO_BOOKS.serendipity.title

    const catalog = await findBookByIsbnOrTitle({ title })
    const booksId = catalog.ok && catalog.data?.id ? catalog.data.id : DEMO_BOOKS.serendipity.fallbackBooksId
    const dwellBook: DwellBookCandidate = {
      ...demoBookToEntry(DEMO_BOOKS.serendipity, booksId),
      title,
      detectedAt: Date.now(),
      source: 'cover',
    }
    depsRef.current.setContext({ pendingDwellBook: dwellBook })
    setDemoStep('serendipity_dwell')
    await depsRef.current.appendAssistantAndStore(
      `"${dwellBook.title}" 표지를 확인했어요. 마음에 드시면 담기, 아니면 내려놓고 이동을 재개해 주세요.`,
    )
  }, [setDemoStep])

  const handleDwellFeedback = useCallback(
    async (negativeReason: string, dwellBook: DwellBookCandidate) => {
      if (!isDemoMode()) return false
      const alt = await runDemoAlternativePick({
        rejectedTitle: dwellBook.title,
        negativeReason,
      })
      if (!alt) {
        await depsRef.current.appendAssistantAndStore(
          '보완 추천을 준비하지 못했어요. 잠시 후 다시 말씀해 주세요.',
        )
        return true
      }
      const toolResult = buildDemoRecommendationToolResult([alt.entry])
      depsRef.current.setContext({ lastToolResult: toolResult, awaitingDwellFeedback: false, pendingDwellBook: null })
      setDemoStep('alternative_recommend')
      await depsRef.current.appendAssistantAndStore(alt.message, alt.attachments)
      return true
    },
    [setDemoStep],
  )

  const handleAlternativeAccepted = useCallback(async () => {
    if (!isDemoMode()) return
    if (demoStateRef.current.step !== 'alternative_recommend') return
    setDemoStep('nav_multi')
    dispatchDemoMissionForKeys(['book2', 'alternative'])
    await depsRef.current.appendAssistantAndStore(
      `"${DEMO_BOOKS.book2.title}"과 "${DEMO_BOOKS.alternative.title}" 서가를 차례로 안내할게요.`,
    )
  }, [setDemoStep])

  useEffect(() => {
    if (!isDemoMode()) return
    return subscribeDwellEvent(async (event) => {
      if (event.type === 'SHELF_ARRIVED') {
        const step = demoStateRef.current.step
        if (step === 'visiting_planned' && event.legIndex >= 0) {
          const key = missionKeysRef.current[event.legIndex]
          const def = key ? DEMO_BOOKS[key] : null
          if (def) {
            await depsRef.current.appendAssistantAndStore(
              `서가에 도착했어요. "${def.title}"을 확인해 보시고 마음에 들면 담기 버튼으로 장바구니에 담아 주세요.`,
            )
          }
        }
        if (step === 'nav_multi' && event.legIndex >= 0) {
          const titles = [DEMO_BOOKS.book2.title, DEMO_BOOKS.alternative.title]
          const title = titles[event.legIndex] ?? '추천 도서'
          await depsRef.current.appendAssistantAndStore(`"${title}" 서가입니다. 확인 후 담아 주세요.`)
        }
      }
      if (event.type === 'CHECKOUT_ARRIVED') {
        const result = await completeCheckoutPurchase(depsRef.current.toolExecutionContext)
        if (result.ok) {
          await depsRef.current.appendAssistantAndStore(result.message)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!isDemoMode()) return
    return subscribeMapSnapshot(async (snapshot) => {
      const leg = snapshot.activeLeg
      if (leg === null || leg < 0) return
      const step = demoStateRef.current.step
      if (step !== 'visiting_planned' && step !== 'nav_multi') return

      const key =
        step === 'visiting_planned'
          ? missionKeysRef.current[leg]
          : leg === 0
            ? 'book2'
            : leg === 1
              ? 'alternative'
              : null
      const def = key ? DEMO_BOOKS[key] : null
      if (!def) return

      activeNavBookRef.current = {
        title: def.title,
        authors: def.authors,
        description: def.description,
      }
      const { message, nextState } = await maybeAnnounceTransitMonologue({
        state: demoStateRef.current,
        activeLeg: leg,
        title: def.title,
        authors: def.authors,
        description: def.description,
        demoStep: step,
      })
      demoStateRef.current = nextState
      if (message) await depsRef.current.appendAssistantAndStore(message)
    })
  }, [])

  return {
    startShelfVisitFromList,
    handleBrowseCapture,
    handleDwellFeedback,
    handleAlternativeAccepted,
    demoStateRef,
  }
}
