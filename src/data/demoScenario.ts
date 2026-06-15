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
  /** 서가 도착 TTS — 줄거리 (1~2문장) */
  synopsisBrief: string
  /** 서가 도착 TTS — 독자 리뷰/반응 (1문장) */
  reviewBrief: string
  /** 서가 도착 TTS — 작가 소개 (1문장) */
  authorBioBrief: string
  poolIndex: number
}

export const DEMO_BOOKS: Record<DemoBookKey, DemoBookDef> = {
  book1: {
    key: 'book1',
    title: '어른이 된다는 것',
    authors: '김창진',
    fallbackBooksId: 'demo-book-adult',
    refCoverFile: '어른이된다는것.jpg',
    description: '어른이란 무엇인지, 관계와 책임을 돌아보는 에세이.',
    synopsisBrief: '어른이란 무엇인지, 관계와 책임을 돌아보는 에세이입니다.',
    reviewBrief: '평점 4.5, 독자들은 공감과 위로를 느꼈다고 남겼어요.',
    authorBioBrief: '김창진 작가는 심리·관계를 다루는 에세이로 잘 알려져 있어요.',
    poolIndex: 4,
  },
  book2: {
    key: 'book2',
    title: '오직 두 사람',
    authors: '김영하',
    fallbackBooksId: 'demo-book-two',
    refCoverFile: '오직두사람.jpg',
    description: '두 사람의 만남과 이별을 따라가는 소설.',
    synopsisBrief: '두 사람의 만남과 이별을 따라가는 소설입니다.',
    reviewBrief: '평점 4.4, 감정선이 섬세하다는 리뷰가 많아요.',
    authorBioBrief: '김영하 작가는 일상 속 관계를 담담하게 그리는 소설가예요.',
    /** bookshelfOverlayLayerInstances[36] — NE corner north arm, robot map (-24.117, -8.361) / world (2.66, -13.19) */
    poolIndex: 36,
  },
  serendipity: {
    key: 'serendipity',
    title: '단 한 사람',
    authors: '최진영',
    fallbackBooksId: 'demo-book-one-person',
    refCoverFile: '단한사람.jpeg',
    description: '한 사람에게 집중하는 이야기. 결말의 온기가 궁금해질 수 있어요.',
    synopsisBrief: '한 사람에게 집중하는 이야기로, 잔잔하지만 깊은 여운이 남아요.',
    reviewBrief: '평점 4.6, 결말의 온기가 인상적이라는 평이 많아요.',
    authorBioBrief: '최진영 작가는 관계와 감정의 결을 섬세하게 풀어내는 작가예요.',
    poolIndex: 6,
  },
  alternative: {
    key: 'alternative',
    title: '너무나 많은 여름이',
    authors: '김연수',
    fallbackBooksId: 'demo-book-summer',
    refCoverFile: '너무나많은여름이.jpg',
    description: '여름과 관계, 상실과 회복을 담은 소설집.',
    synopsisBrief: '여름과 관계, 상실과 회복을 담은 소설집입니다.',
    reviewBrief: '평점 4.5, 여름의 감각과 슬픔이 잘 살아 있다는 리뷰가 많아요.',
    authorBioBrief: '김연수 작가는 계절과 기억을 통해 관계를 그리는 소설가예요.',
    poolIndex: 9,
  },
}

/** 출발 전 선택: 오직 두 사람 1권 */
export const DEMO_PLANNED_BOOK_KEYS: DemoBookKey[] = ['book2']

const DEMO_REF_COVER_BASE =
  (import.meta.env ?? {}).VITE_BOOK_RECOGNITION_API_BASE?.trim() || '/book-recognition'

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

export function findDemoBookByPoolIndex(poolIndex: number): DemoBookDef | null {
  for (const def of Object.values(DEMO_BOOKS)) {
    if (def.poolIndex === poolIndex) return def
  }
  return null
}

export function demoPoolIndicesForKeys(keys: DemoBookKey[]): number[] {
  return keys.map((key) => DEMO_BOOKS[key].poolIndex)
}

/** 담은 책 목록에서 시연 서가 방문 순서(데모 도서 키)를 뽑는다. */
export function resolveDemoMissionKeys(entries: ShoppingListEntry[]): DemoBookKey[] {
  return DEMO_PLANNED_BOOK_KEYS.filter((key) =>
    entries.some((entry) => findDemoBookByTitle(entry.title)?.key === key),
  )
}

export type DemoScenarioBookCandidate = {
  booksId: string
  title: string
  authors: string
}

export function demoScenarioBookCandidate(key: DemoBookKey): DemoScenarioBookCandidate {
  const def = DEMO_BOOKS[key]
  return {
    booksId: def.fallbackBooksId,
    title: def.title,
    authors: def.authors,
  }
}

/** 이동 중 browse dwell 대상 — 단 한 사람 (담지 않음). */
export const DEMO_DWELL_BOOK = demoScenarioBookCandidate('serendipity')

/** transit detour 후 추천 책 — 어른이 된다는 것. */
export const DEMO_RECOMMENDED_BOOK = demoScenarioBookCandidate('book1')
