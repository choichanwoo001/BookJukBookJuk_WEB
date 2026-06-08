import { useCallback, useEffect, useRef } from 'react'
import { isDemoMode } from '../config/demoMode'
import {
  DEMO_BOOKS,
  type DemoBookKey,
  type DemoStep,
} from '../data/demoScenario'
import type { TasteSeed } from '../types/onboarding'
import type { DwellBookCandidate, ToolResult } from '../agent/types'
import {
  subscribeDwellEvent,
  subscribeMapSnapshot,
} from '../agent/runtime/agentEventBus'
import { completeCheckoutPurchase } from '../agent/tools/checkoutCompletion'
import type { ToolExecutionContext } from '../agent/types'
import {
  buildDemoInitialRecommendEntries,
  buildDemoRecommendationToolResult,
  demoRecommendAttachments,
  dispatchDemoMissionForKeys,
  initialDemoOrchestratorState,
  maybeAnnounceTransitMonologue,
  narrateDemoRecommendations,
  parseDemoBookPick,
  runDemoAlternativePick,
  type DemoOrchestratorState,
} from './chatAgent/demoOrchestrator'
import { getBookRecognitionClient } from '../agent/bridges/bookRecognitionBridge'
import { findBookByIsbnOrTitle } from '../lib/supabase/books'
import { demoBookToEntry } from '../data/demoScenario'

type DemoOrchestratorDeps = {
  tasteSeed: TasteSeed | null
  toolExecutionContext: ToolExecutionContext
  appendAssistantAndStore: (text: string, attachments?: string[]) => Promise<void>
  setContext: (patch: Partial<import('../agent/types').AgentContext>) => void
  getContext: () => import('../agent/types').AgentContext
  runAfterCartAdd?: (result: ToolResult) => Promise<void>
}

export function useDemoOrchestrator(deps: DemoOrchestratorDeps) {
  const demoStateRef = useRef<DemoOrchestratorState>(initialDemoOrchestratorState())
  const demoStartedRef = useRef(false)
  const activeNavBookRef = useRef<{ title: string; authors: string; description?: string } | null>(null)
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  const setDemoStep = useCallback((step: DemoStep) => {
    demoStateRef.current = { ...demoStateRef.current, step }
  }, [])

  const runInitialRecommend = useCallback(async () => {
    if (!isDemoMode() || demoStartedRef.current) return
    demoStartedRef.current = true
    setDemoStep('intro_recommend')

    const entries = await buildDemoInitialRecommendEntries()
    const toolResult = buildDemoRecommendationToolResult(entries)
    depsRef.current.setContext({ lastToolResult: toolResult, state: 'RECO_DISCOVERY' })

    const narration = await narrateDemoRecommendations(depsRef.current.tasteSeed, entries)
    const attachments = demoRecommendAttachments(entries)
    await depsRef.current.appendAssistantAndStore(
      narration ?? toolResult.message,
      attachments,
    )
    setDemoStep('intro_recommend')
  }, [setDemoStep])

  const startNavToBook = useCallback(
    async (bookKey: DemoBookKey) => {
      const def = DEMO_BOOKS[bookKey]
      activeNavBookRef.current = {
        title: def.title,
        authors: def.authors,
        description: def.description,
      }
      dispatchDemoMissionForKeys([bookKey])
      demoStateRef.current = {
        ...demoStateRef.current,
        step: bookKey === 'book1' ? 'nav_to_book_1' : 'nav_to_book_2',
        transitLegAnnounced: -1,
      }
      await depsRef.current.appendAssistantAndStore(
        `"${def.title}"이 있는 서가로 안내할게요. 이동하면서 책 이야기도 이어갈게요.`,
      )
    },
    [],
  )

  const handleUserPick = useCallback(
    async (text: string) => {
      if (!isDemoMode()) return false
      const step = demoStateRef.current.step
      const picked = parseDemoBookPick(text)
      if (!picked) return false

      if (step === 'intro_recommend' && picked.key === 'book1') {
        await startNavToBook('book1')
        return true
      }
      if (step === 'refresh_recommend' && picked.key === 'book2') {
        await startNavToBook('book2')
        return true
      }
      return false
    },
    [startNavToBook],
  )

  const handleCartAddSuccess = useCallback(async () => {
    if (!isDemoMode()) return
    const step = demoStateRef.current.step
    if (step === 'at_shelf_1' || step === 'nav_to_book_1') {
      setDemoStep('refresh_recommend')
      const entries = await buildDemoInitialRecommendEntries()
      const filtered = entries.filter((e) => e.title !== DEMO_BOOKS.book1.title)
      const toolResult = buildDemoRecommendationToolResult(filtered.length > 0 ? filtered : entries)
      depsRef.current.setContext({ lastToolResult: toolResult })
      const narration = await narrateDemoRecommendations(depsRef.current.tasteSeed, filtered)
      await depsRef.current.appendAssistantAndStore(
        narration ?? '첫 책을 담았어요. 이어서 두 번째 추천을 보여드릴게요.',
        demoRecommendAttachments(filtered),
      )
    }
  }, [setDemoStep])

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
      await depsRef.current.appendAssistantAndStore(alt.message, demoRecommendAttachments([alt.entry]))
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
        if (step === 'nav_to_book_1') {
          setDemoStep('at_shelf_1')
          await depsRef.current.appendAssistantAndStore(
            `서가에 도착했어요. "${DEMO_BOOKS.book1.title}"을 펼쳐보시고 마음에 들면 담기 버튼으로 장바구니에 담아 주세요.`,
          )
        }
        if (step === 'nav_to_book_2') {
          await depsRef.current.appendAssistantAndStore(
            `"${DEMO_BOOKS.book2.title}" 서가예요. 확인해 보시고 담아 주세요.`,
          )
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
  }, [setDemoStep])

  useEffect(() => {
    if (!isDemoMode()) return
    return subscribeMapSnapshot(async (snapshot) => {
      const leg = snapshot.activeLeg
      if (leg === null || leg < 0) return
      const navBook = activeNavBookRef.current
      if (!navBook) return
      const { message, nextState } = await maybeAnnounceTransitMonologue({
        state: demoStateRef.current,
        activeLeg: leg,
        title: navBook.title,
        authors: navBook.authors,
        description: navBook.description,
        demoStep: demoStateRef.current.step,
      })
      demoStateRef.current = nextState
      if (message) await depsRef.current.appendAssistantAndStore(message)
    })
  }, [])

  return {
    runInitialRecommend,
    handleUserPick,
    handleCartAddSuccess,
    handleBrowseCapture,
    handleDwellFeedback,
    handleAlternativeAccepted,
    demoStateRef,
  }
}
