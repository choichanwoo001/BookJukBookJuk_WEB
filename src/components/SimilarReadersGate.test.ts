import { describe, expect, it } from 'vitest'
import { partitionReaderBookEntries, planEntryFromReaderBook } from '../utils/similarReadersPlan'
import type { ReaderBook, ReaderProfile } from '../types/onboarding'

const profile: ReaderProfile = {
  id: 'reader-test',
  name: '테스트 독자',
  avatarTone: 'sea',
  tagline: 'tag',
  similarity: 90,
  tasteTags: [],
  reasons: [],
  description: 'desc',
  likedBooks: [
    { id: 'liked-1', title: 'A책', author: '저자A', reason: 'r' },
    { id: 'liked-2', title: 'B책', author: '저자B', reason: 'r' },
  ],
  readBooks: [],
}

const books: ReaderBook[] = profile.likedBooks

describe('planEntryFromReaderBook', () => {
  it('maps demo scenario titles to stable demo book ids', () => {
    const entry = planEntryFromReaderBook(profile, {
      id: 'demo-book1',
      title: '어른이 된다는 것',
      author: '김창진',
      reason: 'r',
    })
    expect(entry.booksId).toBe('demo-book-adult')
    expect(decodeURIComponent(entry.coverImageUrl ?? '')).toContain('어른이된다는것.jpg')
  })
})

describe('partitionReaderBookEntries', () => {
  it('splits books into add and remove buckets without mixing actions', () => {
    const plannedIds = new Set([planEntryFromReaderBook(profile, books[0]).booksId])
    const { toAdd, toRemove } = partitionReaderBookEntries(profile, books, plannedIds)
    expect(toRemove).toHaveLength(1)
    expect(toRemove[0]?.title).toBe('A책')
    expect(toAdd).toHaveLength(1)
    expect(toAdd[0]?.title).toBe('B책')
  })

  it('returns only remove targets when every book is already planned', () => {
    const plannedIds = new Set(books.map((book) => planEntryFromReaderBook(profile, book).booksId))
    const { toAdd, toRemove } = partitionReaderBookEntries(profile, books, plannedIds)
    expect(toAdd).toHaveLength(0)
    expect(toRemove).toHaveLength(2)
  })
})
