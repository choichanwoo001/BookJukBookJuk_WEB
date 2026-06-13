import { describe, expect, it } from 'vitest'
import {
  DEMO_BOOKS,
  DEMO_PLANNED_BOOK_KEYS,
  DEMO_SCENARIO_ROUTE_KEYS,
  demoBookToEntry,
  demoRefCoverUrl,
  findDemoBookByTitle,
  demoPoolIndicesForKeys,
} from '../data/demoScenario'
import { bookKeysToPoolIndices } from '../utils/bookShelfNavigation'
import {
  beginDemoNavigationFromShoppingList,
  resolveDemoMissionKeys,
} from '../hooks/chatAgent/demoOrchestrator'

describe('demoScenario', () => {
  it('defines four demo books', () => {
    expect(Object.keys(DEMO_BOOKS)).toHaveLength(4)
  })

  it('lists planned demo books for similar-readers selection', () => {
    expect(DEMO_PLANNED_BOOK_KEYS).toEqual(['book1', 'book2'])
  })

  it('uses ref cover urls when no db cover is provided', () => {
    const entry = demoBookToEntry(DEMO_BOOKS.book1)
    expect(entry.coverImageUrl).toBe(demoRefCoverUrl(DEMO_BOOKS.book1))
    expect(decodeURIComponent(entry.coverImageUrl ?? '')).toContain('어른이된다는것.jpg')
  })

  it('prefers an explicit cover url over the ref fallback', () => {
    const entry = demoBookToEntry(DEMO_BOOKS.book2, 'db-id', 'https://example.com/cover.jpg')
    expect(entry.coverImageUrl).toBe('https://example.com/cover.jpg')
  })

  it('finds demo book by partial title', () => {
    expect(findDemoBookByTitle('어른이 된다는 것')?.key).toBe('book1')
    expect(findDemoBookByTitle('시선으로부터')?.key).toBe('alternative')
    expect(DEMO_BOOKS.book2.authors).toBe('김영하')
    expect(DEMO_BOOKS.serendipity.authors).toBe('최진영')
  })

  it('maps book keys to pool indices', () => {
    const indices = bookKeysToPoolIndices(['book1', 'book2'])
    expect(indices).toEqual([
      DEMO_BOOKS.book1.poolIndex,
      DEMO_BOOKS.book2.poolIndex,
    ])
    expect(demoPoolIndicesForKeys(['alternative'])).toEqual([DEMO_BOOKS.alternative.poolIndex])
  })

  it('resolves mission keys from a shopping list in visit order', () => {
    const keys = resolveDemoMissionKeys([
      { booksId: 'demo-book-two', title: '오직 두 사람', authors: '김영하', coverImageUrl: '' },
      { booksId: 'demo-book-adult', title: '어른이 된다는 것', authors: '우치다 타츠루', coverImageUrl: '' },
    ])
    expect(keys).toEqual(['book1', 'book2'])
  })

  it('begins shelf visit with the full automatic demo route', () => {
    const keys = beginDemoNavigationFromShoppingList([
      { booksId: 'demo-book-two', title: '오직 두 사람', authors: '김영하', coverImageUrl: '' },
      { booksId: 'demo-book-adult', title: '어른이 된다는 것', authors: '우치다 타츠루', coverImageUrl: '' },
    ])
    expect(keys).toEqual(DEMO_SCENARIO_ROUTE_KEYS)
  })
})

