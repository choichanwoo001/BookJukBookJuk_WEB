import { useCallback, useEffect, useRef } from 'react'

import { isDemoMode } from '../config/demoMode'

import {

  DEMO_BOOKS,

  type DemoBookKey,

  type DemoStep,

  demoBookToEntry,

  findDemoBookByTitle,

} from '../data/demoScenario'

import type { DwellBookCandidate, ShoppingListEntry, ToolExecutionContext } from '../agent/types'

import {

  subscribeMapCommand,

  subscribeDwellEvent,

  subscribeNavigationSync,

  dispatchGoCheckout,

  dispatchStartNavigation,

} from '../agent/runtime/agentEventBus'

import { completeCheckoutPurchase } from '../agent/tools/checkoutCompletion'

import { generateTransitMonologue } from '../agent/runtime/llmTransitMonologue'

import {

  beginDemoNavigationFromShoppingList,

  buildDemoRecommendationToolResult,

  claimTransitMonologueLeg,

  dispatchDemoMissionForKeys,

  initialDemoOrchestratorState,

  requestDemoSerendipityLegNav,

  runDemoAlternativePick,

  type DemoOrchestratorState,

} from './chatAgent/demoOrchestrator'

import type { PipelineItem } from './chatAgent/assistantOutputPipeline'

import { isEnRoute } from '../types/navigationMobility'

import { findBookByIsbnOrTitle } from '../lib/supabase/books'



type DemoOrchestratorDeps = {

  toolExecutionContext: ToolExecutionContext

  enqueueAssistant: (item: PipelineItem) => void

  enqueueAssistantMany: (items: PipelineItem[]) => void

  setContext: (patch: Partial<import('../agent/types').AgentContext>) => void

}



type DemoArrivalDedupeEvent =

  | { type: 'SHELF_ARRIVED'; legIndex: number; poolIndex: number | null }

  | { type: 'CHECKOUT_ARRIVED' }



export function buildDemoArrivalDedupeKey(

  navigationRunId: number,

  event: DemoArrivalDedupeEvent,

): string {

  if (event.type === 'CHECKOUT_ARRIVED') return `${navigationRunId}:checkout`

  return `${navigationRunId}:shelf:${event.legIndex}:${event.poolIndex ?? 'none'}`

}



export function claimDemoArrivalEvent(

  processedKeys: Set<string>,

  navigationRunId: number,

  event: DemoArrivalDedupeEvent,

): boolean {

  const key = buildDemoArrivalDedupeKey(navigationRunId, event)

  if (processedKeys.has(key)) return false

  processedKeys.add(key)

  return true

}



function resolveMissionKeyForLeg(step: DemoStep, leg: number, missionKeys: DemoBookKey[]): DemoBookKey | null {

  if (step === 'visiting_planned') return missionKeys[leg] ?? null

  if (step === 'nav_multi') {

    if (leg === 0) return 'book2'

    if (leg === 1) return 'alternative'

  }

  return null

}



export function useDemoOrchestrator(deps: DemoOrchestratorDeps) {

  const demoStateRef = useRef<DemoOrchestratorState>(initialDemoOrchestratorState())

  const missionKeysRef = useRef<DemoBookKey[]>([])

  const navigationRunIdRef = useRef(0)

  const processedArrivalKeysRef = useRef<Set<string>>(new Set())

  const autoScenarioTimersRef = useRef<number[]>([])

  const depsRef = useRef(deps)

  useEffect(() => {

    depsRef.current = deps

  }, [deps])



  useEffect(() => {

    return () => {

      for (const timer of autoScenarioTimersRef.current) window.clearTimeout(timer)

      autoScenarioTimersRef.current = []

    }

  }, [])



  const scheduleAutoScenario = useCallback((fn: () => void | Promise<void>, delayMs: number) => {

    const timer = window.setTimeout(() => {

      autoScenarioTimersRef.current = autoScenarioTimersRef.current.filter((id) => id !== timer)

      void fn()

    }, delayMs)

    autoScenarioTimersRef.current.push(timer)

  }, [])



  const ensureDemoCartItem = useCallback((key: DemoBookKey) => {

    const def = DEMO_BOOKS[key]

    const entry = demoBookToEntry(def)

    const context = depsRef.current.toolExecutionContext.getContext()

    if (!context) return

    const currentCart = Array.isArray(context.cartItems) ? context.cartItems : []

    const currentShoppingList = Array.isArray(context.shoppingList) ? context.shoppingList : []

    const cartItems = currentCart.length > 0 ? currentCart : currentShoppingList

    if (cartItems.some((item) => item.booksId === entry.booksId || item.title === entry.title)) return

    const next = [...cartItems, entry]

    depsRef.current.setContext({ cartItems: next, shoppingList: next })

  }, [])



  const resetArrivalGate = useCallback(() => {

    navigationRunIdRef.current += 1

    processedArrivalKeysRef.current.clear()

    for (const timer of autoScenarioTimersRef.current) window.clearTimeout(timer)

    autoScenarioTimersRef.current = []

  }, [])



  const setDemoStep = useCallback((step: DemoStep) => {

    demoStateRef.current = { ...demoStateRef.current, step }

  }, [])



  const startShelfVisitFromList = useCallback((entries: ShoppingListEntry[]) => {

    if (!isDemoMode()) return

    resetArrivalGate()

    const keys = beginDemoNavigationFromShoppingList(entries)

    missionKeysRef.current = keys

    demoStateRef.current = {

      ...demoStateRef.current,

      step: 'visiting_planned',

      transitLegAnnounced: -1,

      awaitingNavConfirm: null,

    }

  }, [resetArrivalGate])



  const enterSerendipityDwell = useCallback(async (legIndex: number) => {

    const serendipityDef = DEMO_BOOKS.serendipity

    const catalog = await findBookByIsbnOrTitle({ title: serendipityDef.title })

    const booksId = catalog.ok && catalog.data?.id ? catalog.data.id : serendipityDef.fallbackBooksId

    const dwellBook: DwellBookCandidate = {

      ...demoBookToEntry(DEMO_BOOKS.serendipity, booksId),

      detectedAt: Date.now(),

      source: 'cover',

    }

    depsRef.current.setContext({

      pendingDwellBook: dwellBook,

      awaitingDwellFeedback: false,

      mobilityPaused: true,

    })

    setDemoStep('serendipity_dwell')

    depsRef.current.enqueueAssistant({

      text: `길가 서가에서 "${dwellBook.title}"에 눈길이 가네요. 잠시 펼쳐보시고, 마음에 들면 담기, 아니면 내려놓고 이동을 재개해 주세요.`,

      gate: { kind: 'on_shelf_arrived', leg: legIndex },

    })

  }, [setDemoStep])



  const handleBrowseCapture = useCallback(async (imageBase64: string) => {

    if (!isDemoMode()) return

    void imageBase64

    const leg = missionKeysRef.current.indexOf('serendipity')

    await enterSerendipityDwell(leg >= 0 ? leg : 1)

  }, [enterSerendipityDwell])



  const handleDwellFeedback = useCallback(

    async (negativeReason: string, dwellBook: DwellBookCandidate) => {

      if (!isDemoMode()) return false

      const alt = await runDemoAlternativePick({

        rejectedTitle: dwellBook.title,

        negativeReason,

      })

      if (!alt) {

        depsRef.current.enqueueAssistant({

          text: '보완 추천을 준비하지 못했어요. 잠시 후 다시 말씀해 주세요.',

          gate: { kind: 'immediate' },

        })

        return true

      }

      const toolResult = buildDemoRecommendationToolResult([alt.entry])

      depsRef.current.setContext({

        lastToolResult: toolResult,

        awaitingDwellFeedback: false,

        pendingDwellBook: null,

        mobilityPaused: false,

      })

      setDemoStep('alternative_recommend')

      depsRef.current.enqueueAssistant({

        text: alt.message,

        attachments: alt.attachments,

        gate: { kind: 'immediate' },

      })

      return true

    },

    [setDemoStep],

  )



  const handleAlternativeAccepted = useCallback(async () => {

    if (!isDemoMode()) return

    if (demoStateRef.current.step !== 'alternative_recommend') return

    resetArrivalGate()

    setDemoStep('nav_multi')

    missionKeysRef.current = ['book2', 'alternative']

    dispatchDemoMissionForKeys(['book2', 'alternative'])

    dispatchStartNavigation()

    depsRef.current.enqueueAssistant({

      text: `"${DEMO_BOOKS.book2.title}"과 "${DEMO_BOOKS.alternative.title}" 서가를 차례로 안내할게요.`,

      gate: { kind: 'after_nav_ready' },

    })

  }, [resetArrivalGate, setDemoStep])



  const requestNavAfterBook2Pick = useCallback(async () => {

    if (!isDemoMode()) return

    const keys = requestDemoSerendipityLegNav()

    demoStateRef.current = {

      ...demoStateRef.current,

      step: 'awaiting_nav_confirm',

      awaitingNavConfirm: keys,

      transitLegAnnounced: -1,

    }

    depsRef.current.enqueueAssistant({

      text: `"${DEMO_BOOKS.serendipity.title}" 서가를 잠시 들른 뒤 "${DEMO_BOOKS.book2.title}"으로 이어갈게요. 준비되시면 "진행" 또는 "오케이"라고 답해 주세요.`,

      gate: { kind: 'immediate' },

    })

  }, [])



  const confirmDemoNavToBook = useCallback(async (keys: DemoBookKey[]) => {

    if (!isDemoMode()) return

    resetArrivalGate()

    missionKeysRef.current = keys

    demoStateRef.current = {

      ...demoStateRef.current,

      step: 'visiting_planned',

      awaitingNavConfirm: null,

      transitLegAnnounced: -1,

    }

    dispatchDemoMissionForKeys(keys)

    dispatchStartNavigation()

    depsRef.current.enqueueAssistant({

      text: '안내를 이어갈게요.',

      gate: { kind: 'after_nav_ready' },

    })

  }, [resetArrivalGate])



  useEffect(() => {

    if (!isDemoMode()) return

    return subscribeMapCommand((command) => {

      if (command.type === 'GO_CHECKOUT') {

        resetArrivalGate()

      }

    })

  }, [resetArrivalGate])



  const handleCartAddSuccess = useCallback(

    async (addedTitle: string) => {

      if (!isDemoMode()) return

      const key = findDemoBookByTitle(addedTitle)?.key

      if (key === 'book1' && demoStateRef.current.step === 'visiting_planned') {

        depsRef.current.enqueueAssistant({

          text: '담으신 책을 반영해 추천을 갱신했어요. 마음에 드는 책을 고르시면 이어서 안내할게요.',

          gate: { kind: 'immediate' },

        })

      }

      if (key === 'book2') {

        await requestNavAfterBook2Pick()

      }

    },

    [requestNavAfterBook2Pick],

  )



  useEffect(() => {

    if (!isDemoMode()) return

    return subscribeDwellEvent(async (event) => {

      if (event.type === 'SHELF_ARRIVED') {

        const claimed = claimDemoArrivalEvent(

          processedArrivalKeysRef.current,

          navigationRunIdRef.current,

          event,

        )

        if (!claimed) return

        const step = demoStateRef.current.step

        if (

          (step === 'visiting_planned' ||

            step === 'serendipity_dwell' ||

            step === 'alternative_recommend' ||

            step === 'checkout') &&

          event.legIndex >= 0

        ) {

          const key = missionKeysRef.current[event.legIndex]

          if (key === 'serendipity') {

            await enterSerendipityDwell(event.legIndex)

            scheduleAutoScenario(async () => {

              const dwellBook = depsRef.current.toolExecutionContext.getContext().pendingDwellBook

              depsRef.current.enqueueAssistant({

                text: '좋아요. 이 책은 담지 않고 지나갈게요. 대신 방금 보신 분위기를 기준으로 더 맞는 책을 찾아볼게요.',

                gate: { kind: 'immediate' },

              })

              if (dwellBook) {

                await handleDwellFeedback('지금은 구매하지 않고, 비슷하지만 더 끌리는 책을 보고 싶어요.', dwellBook)

              }

            }, 1800)

            return

          }

          const arrivalItems: PipelineItem[] = []

          const def = key ? DEMO_BOOKS[key] : null

          if (def) {

            arrivalItems.push({

              text: `서가에 도착했어요. "${def.title}"을 확인해 보시고 마음에 들면 담기 버튼으로 장바구니에 담아 주세요.`,

              gate: { kind: 'on_shelf_arrived', leg: event.legIndex },

            })

          }

          if (key === 'book1') {

            ensureDemoCartItem('book1')

            arrivalItems.push({

              text: '첫 번째 책은 장바구니에 담아둘게요. 이제 다음 책으로 가는 길에 잠깐 자유롭게 둘러보겠습니다.',

              gate: { kind: 'immediate' },

            })

          }

          if (key === 'book2') {

            ensureDemoCartItem('book2')

            arrivalItems.push({

              text: '두 번째 책 위치에 도착했어요. 이 책도 후보로 유지하고, 방금 추천한 대체 책까지 이어서 확인해볼게요.',

              gate: { kind: 'immediate' },

            })

          }

          if (key === 'alternative') {

            ensureDemoCartItem('alternative')

            setDemoStep('checkout')

            arrivalItems.push({

              text: '대체 추천 책까지 확인했어요. 마음에 드는 후보를 담고 계산대로 이동하겠습니다.',

              gate: { kind: 'immediate' },

            })

            depsRef.current.enqueueAssistantMany(arrivalItems)

            scheduleAutoScenario(() => {

              dispatchGoCheckout()

            }, 900)

            return

          }

          if (arrivalItems.length > 0) {

            depsRef.current.enqueueAssistantMany(arrivalItems)

          }

        }

        if (step === 'nav_multi' && event.legIndex >= 0) {

          const titles = [DEMO_BOOKS.book2.title, DEMO_BOOKS.alternative.title]

          const title = titles[event.legIndex] ?? '추천 도서'

          depsRef.current.enqueueAssistant({

            text: `"${title}" 서가입니다. 확인 후 담아 주세요.`,

            gate: { kind: 'on_shelf_arrived', leg: event.legIndex },

          })

        }

      }

      if (event.type === 'CHECKOUT_ARRIVED') {

        const claimed = claimDemoArrivalEvent(

          processedArrivalKeysRef.current,

          navigationRunIdRef.current,

          event,

        )

        if (!claimed) return

        const result = await completeCheckoutPurchase(depsRef.current.toolExecutionContext)

        if (result.ok) {

          depsRef.current.enqueueAssistant({

            text: result.message,

            gate: { kind: 'on_checkout_arrived' },

          })

        }

      }

    })

  }, [

    ensureDemoCartItem,

    enterSerendipityDwell,

    handleDwellFeedback,

    scheduleAutoScenario,

    setDemoStep,

  ])



  useEffect(() => {

    if (!isDemoMode()) return

    return subscribeNavigationSync((sync) => {

      const leg = sync.activeLeg

      if (leg === null || leg < 0) return

      const step = demoStateRef.current.step

      if (step !== 'visiting_planned' && step !== 'nav_multi') return



      const enRoute = isEnRoute({

        isAutoWalking: sync.isAutoWalking,

        isWalkMode: sync.isWalkMode,

        isManualWalking: sync.isManualWalking,

        distanceToGoalM: sync.distanceToGoalM,

      })

      if (!enRoute) return



      const key = resolveMissionKeyForLeg(step, leg, missionKeysRef.current)

      const def = key ? DEMO_BOOKS[key] : null

      if (!def) return



      const { claimed, nextState } = claimTransitMonologueLeg(demoStateRef.current, leg)

      demoStateRef.current = nextState

      if (!claimed) return



      void generateTransitMonologue({

        title: def.title,

        authors: def.authors,

        description: def.description,

        demoStep: step,

        legIndex: leg,

      }).then((message) => {

        if (!message) return

        depsRef.current.enqueueAssistant({

          text: message,

          gate: { kind: 'on_walk_started', leg },

        })

      })

    })

  }, [])



  return {

    startShelfVisitFromList,

    handleBrowseCapture,

    handleDwellFeedback,

    handleAlternativeAccepted,

    confirmDemoNavToBook,

    handleCartAddSuccess,

    demoStateRef,

  }

}


