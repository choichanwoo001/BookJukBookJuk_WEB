import type { ShoppingListEntry } from '../agent/types'

export type DemoBookKey = 'book1' | 'book2' | 'serendipity' | 'alternative'

export type DemoBookDef = {
  key: DemoBookKey
  title: string
  authors: string
  /** Stable id when DB lookup fails */
  fallbackBooksId: string
  description: string
  poolIndex: number
}

export type DemoStep =
  | 'idle'
  | 'intro_recommend'
  | 'nav_to_book_1'
  | 'at_shelf_1'
  | 'refresh_recommend'
  | 'nav_to_book_2'
  | 'serendipity_dwell'
  | 'await_feedback'
  | 'alternative_recommend'
  | 'nav_multi'
  | 'checkout'

export const DEMO_BOOKS: Record<DemoBookKey, DemoBookDef> = {
  book1: {
    key: 'book1',
    title: '어른이 된다는 것',
    authors: '김소영',
    fallbackBooksId: 'demo-book-adult',
    description: '어른이 된다는 것에 대한 에세이. 관계와 성장을 조용히 돌아봅니다.',
    poolIndex: 0,
  },
  book2: {
    key: 'book2',
    title: '오직 두 사람',
    authors: '김초엽',
    fallbackBooksId: 'demo-book-two',
    description: '두 사람의 선택과 관계를 따라가는 소설.',
    poolIndex: 2,
  },
  serendipity: {
    key: 'serendipity',
    title: '단 한 사람',
    authors: '이기주',
    fallbackBooksId: 'demo-book-one-person',
    description: '한 사람에게 집중하는 이야기. 결말의 온기가 궁금해질 수 있어요.',
    poolIndex: 4,
  },
  alternative: {
    key: 'alternative',
    title: '시선으로부터',
    authors: '최진영',
    fallbackBooksId: 'demo-book-gaze',
    description: '따뜻한 시선과 회복의 감정을 담은 소설.',
    poolIndex: 6,
  },
}

export const DEMO_INITIAL_RECOMMEND_KEYS: DemoBookKey[] = ['book1', 'book2', 'serendipity']

export function demoBookToEntry(def: DemoBookDef, booksId?: string): ShoppingListEntry {
  return {
    booksId: booksId ?? def.fallbackBooksId,
    title: def.title,
    authors: def.authors,
    coverImageUrl: '',
  }
}

export function findDemoBookByTitle(title: string): DemoBookDef | null {
  const normalized = title.trim().replace(/\s+/g, '')
  for (const def of Object.values(DEMO_BOOKS)) {
    if (def.title.replace(/\s+/g, '').includes(normalized) || normalized.includes(def.title.replace(/\s+/g, ''))) {
      return def
    }
  }
  return null
}

export function demoPoolIndicesForKeys(keys: DemoBookKey[]): number[] {
  return keys.map((key) => DEMO_BOOKS[key].poolIndex)
}
