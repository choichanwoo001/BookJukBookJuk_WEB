import type { AgentContext } from '../agent/types'
import { DEMO_BOOKS, DEMO_DWELL_BOOK } from '../data/demoScenario'

export type DemoActiveBookPreview = {
  title: string
  author?: string
}

export function resolveDemoActiveBook(ctx: {
  dwellDialogueActiveBookKey: AgentContext['dwellDialogueActiveBookKey']
  transitDetourPhase: AgentContext['transitDetourPhase']
}): DemoActiveBookPreview | null {
  if (ctx.dwellDialogueActiveBookKey) {
    const def = DEMO_BOOKS[ctx.dwellDialogueActiveBookKey]
    return { title: def.title, author: def.authors }
  }
  if (ctx.transitDetourPhase === 'serendipity_arrived') {
    return { title: DEMO_DWELL_BOOK.title, author: DEMO_DWELL_BOOK.authors }
  }
  return null
}

export function shouldTrackDemoBrowseInterest(
  transitDetourPhase: AgentContext['transitDetourPhase'],
): boolean {
  return transitDetourPhase === 'serendipity_arrived'
}
