import { describe, expect, it } from 'vitest'
import { bookshelfOverlayLayerInstances } from './bookshelfOverlayLayer'
import {
  DEMO_BOOKS,
  DEMO_DWELL_BOOK,
  DEMO_PLANNED_BOOK_KEYS,
  DEMO_RECOMMENDED_BOOK,
  demoBookToEntry,
  demoRefCoverUrl,
  findDemoBookByTitle,
  demoPoolIndicesForKeys,
  resolveDemoMissionKeys,
} from './demoScenario'
import { robotMapBook2WorldXz } from '../lib/verso/robotMissionCoords'

describe('demoScenario', () => {
  it('defines four demo books', () => {
    expect(Object.keys(DEMO_BOOKS)).toHaveLength(4)
  })

  it('lists planned demo book as 오직 두 사람 only', () => {
    expect(DEMO_PLANNED_BOOK_KEYS).toEqual(['book2'])
  })

  it('maps book2 shelf near robot waypoint world coords', () => {
    const shelf = bookshelfOverlayLayerInstances[DEMO_BOOKS.book2.poolIndex]
    const [wx, wz] = robotMapBook2WorldXz()
    expect(shelf).toBeDefined()
    expect(Math.hypot(shelf!.cx - wx, shelf!.cz - wz)).toBeLessThan(2.5)
  })

  it('uses serendipity for dwell and book1 for recommendation', () => {
    expect(DEMO_DWELL_BOOK.title).toBe(DEMO_BOOKS.serendipity.title)
    expect(DEMO_RECOMMENDED_BOOK.title).toBe(DEMO_BOOKS.book1.title)
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
    expect(findDemoBookByTitle('너무나 많은 여름이')?.key).toBe('alternative')
    expect(DEMO_BOOKS.book2.authors).toBe('김영하')
    expect(DEMO_BOOKS.serendipity.authors).toBe('최진영')
    expect(DEMO_BOOKS.book1.authors).toBe('김창진')
  })

  it('maps book keys to pool indices', () => {
    expect(demoPoolIndicesForKeys(['book1', 'book2'])).toEqual([
      DEMO_BOOKS.book1.poolIndex,
      DEMO_BOOKS.book2.poolIndex,
    ])
    expect(demoPoolIndicesForKeys(['alternative'])).toEqual([DEMO_BOOKS.alternative.poolIndex])
  })

  it('resolves mission keys from a shopping list in visit order', () => {
    const keys = resolveDemoMissionKeys([
      { booksId: 'demo-book-two', title: '오직 두 사람', authors: '김영하', coverImageUrl: '' },
    ])
    expect(keys).toEqual(['book2'])
  })
})
