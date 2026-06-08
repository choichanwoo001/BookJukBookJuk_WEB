import type { DemoBookKey } from './demoScenario'
import { DEMO_BOOKS } from './demoScenario'

/** Demo book key → missionBookshelfPool index (1차 수동 매핑). */
export const DEMO_BOOK_SHELF_INDEX: Record<DemoBookKey, number> = {
  book1: DEMO_BOOKS.book1.poolIndex,
  book2: DEMO_BOOKS.book2.poolIndex,
  serendipity: DEMO_BOOKS.serendipity.poolIndex,
  alternative: DEMO_BOOKS.alternative.poolIndex,
}

export function shelfPoolIndexForDemoBook(key: DemoBookKey): number {
  return DEMO_BOOK_SHELF_INDEX[key]
}
