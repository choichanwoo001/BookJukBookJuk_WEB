import { findBookByIsbnOrTitle } from '../../lib/supabase/books'
import type { ShoppingListEntry, ToolResult } from '../../agent/types'
import {
  DEMO_BOOKS,
  DEMO_INITIAL_RECOMMEND_KEYS,
  type DemoBookDef,
  type DemoBookKey,
  type DemoStep,
  demoBookToEntry,
  findDemoBookByTitle,
} from '../../data/demoScenario'
import { bookKeysToPoolIndices } from '../../utils/bookShelfNavigation'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchSetMission,
  dispatchGoCheckout,
} from '../../agent/runtime/agentEventBus'
import { generateRecommendNarrator } from '../../agent/runtime/llmRecommendNarrator'
import { generateTransitMonologue } from '../../agent/runtime/llmTransitMonologue'
import {
  pickAlternativeWithLlm,
  type AlternativePickerCandidate,
} from '../../agent/runtime/llmAlternativePicker'
import type { TasteSeed } from '../../types/onboarding'

export type DemoOrchestratorState = {
  step: DemoStep
  lastNavLeg: number
  transitLegAnnounced: number
}

export function initialDemoOrchestratorState(): DemoOrchestratorState {
  return { step: 'idle', lastNavLeg: -1, transitLegAnnounced: -1 }
}

export async function resolveDemoBookEntry(def: DemoBookDef): Promise<ShoppingListEntry> {
  const lookup = await findBookByIsbnOrTitle({ title: def.title })
  if (lookup.ok && lookup.data?.id) {
    return demoBookToEntry(def, lookup.data.id)
  }
  return demoBookToEntry(def)
}

export function buildDemoRecommendationToolResult(
  entries: ShoppingListEntry[],
): ToolResult {
  const recommendations = entries.map(
    (e, i) => `취향 추천 ${i + 1}. ${e.title} - ${e.authors || '저자 미상'}`,
  )
  return {
    ok: true,
    toolName: 'recommendationTool',
    message: '데모 취향 추천을 준비했어요.',
    data: {
      recommendations,
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

export async function buildDemoInitialRecommendEntries(): Promise<ShoppingListEntry[]> {
  const defs = DEMO_INITIAL_RECOMMEND_KEYS.map((key) => DEMO_BOOKS[key])
  return Promise.all(defs.map((def) => resolveDemoBookEntry(def)))
}

export function demoRecommendAttachments(entries: ShoppingListEntry[]): string[] {
  return entries.map((e, i) => `${i + 1}. ${e.title} - ${e.authors || '저자 미상'}`)
}

export async function narrateDemoRecommendations(
  tasteSeed: TasteSeed | null,
  entries: ShoppingListEntry[],
): Promise<string | null> {
  return generateRecommendNarrator(
    tasteSeed,
    entries.map((e) => ({
      title: e.title,
      authors: e.authors ?? '',
      reason: DEMO_INITIAL_RECOMMEND_KEYS
        .map((k) => DEMO_BOOKS[k])
        .find((d) => d.title === e.title)?.description,
    })),
  )
}

export function dispatchDemoMissionForKeys(keys: DemoBookKey[]): void {
  dispatchSetMission(bookKeysToPoolIndices(keys))
}

export function parseDemoBookPick(text: string): DemoBookDef | null {
  const indexMatch = text.match(/(\d+)\s*번/)
  if (indexMatch) {
    const idx = Number.parseInt(indexMatch[1], 10) - 1
    const key = DEMO_INITIAL_RECOMMEND_KEYS[idx]
    if (key) return DEMO_BOOKS[key]
  }
  if (text.includes('첫')) return DEMO_BOOKS.book1
  if (text.includes('두') || text.includes('둘')) return DEMO_BOOKS.book2
  return findDemoBookByTitle(text)
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
}): Promise<{ entry: ShoppingListEntry; message: string } | null> {
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
  if (!entry) return { entry: altEntry, message: picked.assistantMessage }
  return {
    entry: {
      booksId: entry.booksId,
      title: entry.title,
      authors: entry.authors,
      coverImageUrl: '',
    },
    message: picked.assistantMessage,
  }
}

export function dispatchDemoCheckoutNav(): void {
  dispatchGoCheckout()
}

export { AGENT_MAP_EVENT_VERSION }
