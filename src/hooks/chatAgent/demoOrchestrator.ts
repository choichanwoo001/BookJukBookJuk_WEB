import { findBookByIsbnOrTitle } from '../../lib/supabase/books'

import type { ShoppingListEntry, ToolResult } from '../../agent/types'

import {

  DEMO_BOOKS,

  DEMO_PLANNED_BOOK_KEYS,

  type DemoBookDef,

  type DemoBookKey,

  type DemoStep,

  demoBookToEntry,

  demoRefCoverUrl,

  findDemoBookByTitle,

} from '../../data/demoScenario'

import { bookKeysToPoolIndices } from '../../utils/bookShelfNavigation'

import {

  AGENT_MAP_EVENT_VERSION,

  dispatchGoCheckout,

  dispatchSetMission,

} from '../../agent/runtime/agentEventBus'

import { generateTransitMonologue } from '../../agent/runtime/llmTransitMonologue'

import {

  pickAlternativeWithLlm,

  type AlternativePickerCandidate,

} from '../../agent/runtime/llmAlternativePicker'



export type DemoOrchestratorState = {

  step: DemoStep

  transitLegAnnounced: number

}



export function initialDemoOrchestratorState(): DemoOrchestratorState {

  return { step: 'idle', transitLegAnnounced: -1 }

}



function resolveDemoCover(def: DemoBookDef, dbCover?: string): string {

  const fromDb = dbCover?.trim()

  return fromDb || demoRefCoverUrl(def)

}



export async function resolveDemoBookEntry(def: DemoBookDef): Promise<ShoppingListEntry> {

  const lookup = await findBookByIsbnOrTitle({ title: def.title })

  if (lookup.ok && lookup.data?.id) {

    return demoBookToEntry(def, lookup.data.id, resolveDemoCover(def, lookup.data.coverImageUrl))

  }

  return demoBookToEntry(def)

}



/** 담은 책 목록에서 시연 서가 방문 순서(데모 도서 키)를 뽑는다. */

export function resolveDemoMissionKeys(entries: ShoppingListEntry[]): DemoBookKey[] {

  return DEMO_PLANNED_BOOK_KEYS.filter((key) =>

    entries.some((entry) => findDemoBookByTitle(entry.title)?.key === key),

  )

}



export function dispatchDemoMissionForKeys(keys: DemoBookKey[]): void {

  dispatchSetMission(bookKeysToPoolIndices(keys))

}



export function beginDemoNavigationFromShoppingList(entries: ShoppingListEntry[]): DemoBookKey[] {

  const keys = resolveDemoMissionKeys(entries)

  if (keys.length > 0) dispatchDemoMissionForKeys(keys)

  return keys

}



function recommendationLines(entries: ShoppingListEntry[]): string[] {

  return entries.map((e, i) => `${i + 1}. ${e.title} - ${e.authors || '저자 미상'}`)

}



function buildDemoRecommendationToolResult(entries: ShoppingListEntry[]): ToolResult {

  return {

    ok: true,

    toolName: 'recommendationTool',

    message: '대안 추천을 준비했어요.',

    data: {

      recommendations: entries.map(

        (e, i) => `보완 추천 ${i + 1}. ${e.title} - ${e.authors || '저자 미상'}`,

      ),

      source: 'demo',

      candidates: entries.map((e) => ({

        booksId: e.booksId,

        title: e.title,

        authors: e.authors,

        coverImageUrl: e.coverImageUrl,

      })),

    },

  }

}



export async function maybeAnnounceTransitMonologue(args: {

  state: DemoOrchestratorState

  activeLeg: number

  title: string

  authors: string

  description?: string

  demoStep: DemoStep

}): Promise<{ message: string | null; nextState: DemoOrchestratorState }> {

  if (args.activeLeg === args.state.transitLegAnnounced) {

    return { message: null, nextState: args.state }

  }

  const message = await generateTransitMonologue({

    title: args.title,

    authors: args.authors,

    description: args.description,

    demoStep: args.demoStep,

    legIndex: args.activeLeg,

  })

  return {

    message,

    nextState: { ...args.state, transitLegAnnounced: args.activeLeg },

  }

}



export async function runDemoAlternativePick(args: {

  rejectedTitle: string

  negativeReason: string

}): Promise<{ entry: ShoppingListEntry; message: string; attachments: string[] } | null> {

  const altDef = DEMO_BOOKS.alternative

  const serendipityDef = DEMO_BOOKS.serendipity

  const altEntry = await resolveDemoBookEntry(altDef)

  const serEntry = await resolveDemoBookEntry(serendipityDef)

  const candidates: AlternativePickerCandidate[] = [

    {

      booksId: altEntry.booksId,

      title: altEntry.title,

      authors: altEntry.authors ?? '',

      description: altDef.description,

    },

    {

      booksId: serEntry.booksId,

      title: serEntry.title,

      authors: serEntry.authors ?? '',

      description: serendipityDef.description,

    },

  ]

  const picked = await pickAlternativeWithLlm({

    rejectedTitle: args.rejectedTitle,

    negativeReason: args.negativeReason,

    candidates,

  })

  if (!picked) return null

  const entry = candidates.find((c) => c.booksId === picked.pickedBooksId)

  const resolved =

    entry?.booksId === altEntry.booksId

      ? altEntry

      : entry?.booksId === serEntry.booksId

        ? serEntry

        : altEntry

  return {

    entry: resolved,

    message: picked.assistantMessage,

    attachments: recommendationLines([resolved]),

  }

}



export function dispatchDemoCheckoutNav(): void {

  dispatchGoCheckout()

}



export { AGENT_MAP_EVENT_VERSION, buildDemoRecommendationToolResult }


