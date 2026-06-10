import type { ShoppingListEntry } from '../agent/types'

export type DemoBookKey = 'book1' | 'book2' | 'serendipity' | 'alternative'

export type DemoBookDef = {
  key: DemoBookKey
  title: string
  authors: string
  /** Stable id when DB lookup fails */
  fallbackBooksId: string
  /** book_recognition/refs/ 표지 파일명 */
  refCoverFile: string
  description: string
  poolIndex: number
}

/** 온보딩에서 담은 책 서가 방문 이후의 시연 단계 */
export type DemoStep =
  | 'idle'
  | 'visiting_planned'
  | 'serendipity_dwell'
  | 'await_feedback'
  | 'alternative_recommend'
  | 'nav_multi'
  | 'checkout'
  | 'awaiting_nav_confirm'

export const DEMO_BOOKS: Record<DemoBookKey, DemoBookDef> = {
  book1: {
    key: 'book1',
    title: '어른이 된다는 것',
    authors: '우치다 타츠루',
    fallbackBooksId: 'demo-book-adult',
    refCoverFile: '어른이된다는것.jpg',
    description: '어른이란 무엇인지, 관계와 책임을 돌아보는 에세이.',
    poolIndex: 27,
  },
  book2: {
    key: 'book2',
    title: '오직 두 사람',
    authors: '김영하',
    fallbackBooksId: 'demo-book-two',
    refCoverFile: '오직두사람.jpg',
    description: '두 사람의 만남과 이별을 따라가는 소설.',
    poolIndex: 9,
  },
  serendipity: {
    key: 'serendipity',
    title: '단 한 사람',
    authors: '최진영',
    fallbackBooksId: 'demo-book-one-person',
    refCoverFile: '단한사람.jpeg',
    description: '한 사람에게 집중하는 이야기. 결말의 온기가 궁금해질 수 있어요.',
    poolIndex: 13,
  },
  alternative: {
    key: 'alternative',
    title: '시선으로부터',
    authors: '정세랑',
    fallbackBooksId: 'demo-book-gaze',
    refCoverFile: '시선으로부터.webp',
    description: '시선과 관계, 회복의 감정을 담은 장편소설.',
    poolIndex: 6,
  },
}

/** 비슷한 독자 화면에서 담는 시연 도서 (서가 방문 순서) */
export const DEMO_PLANNED_BOOK_KEYS: DemoBookKey[] = ['book1', 'book2']

/** 데모 시나리오 전체 경유지 순서 (경로 플래너·미리보기용) */
export const DEMO_SCENARIO_ROUTE_KEYS: DemoBookKey[] = [
  'book1',
  'serendipity',
  'book2',
  'alternative',
]

const DEMO_REF_COVER_BASE =
  import.meta.env.VITE_BOOK_RECOGNITION_API_BASE?.trim() || '/book-recognition'

export function demoRefCoverUrl(def: DemoBookDef): string {
  return `${DEMO_REF_COVER_BASE}/refs/${encodeURIComponent(def.refCoverFile)}`
}

export function demoBookToEntry(
  def: DemoBookDef,
  booksId?: string,
  coverImageUrl?: string,
): ShoppingListEntry {
  return {
    booksId: booksId ?? def.fallbackBooksId,
    title: def.title,
    authors: def.authors,
    coverImageUrl: coverImageUrl?.trim() || demoRefCoverUrl(def),
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

