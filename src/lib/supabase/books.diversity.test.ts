import { describe, expect, it } from 'vitest'
import {
  dedupeBookPreviewList,
  dedupeRankedBookEntries,
  pickDiverseSliceFromRanked,
  type BookPreview,
} from './books'

function book(id: string): BookPreview {
  return {
    id,
    title: `Title ${id}`,
    authors: 'Author',
    coverImageUrl: '',
    kdcClassName: '',
    sector: 0,
  }
}

describe('pickDiverseSliceFromRanked', () => {
  it('returns top limit when no diversity or short list', () => {
    const ranked = [
      { book: book('a'), score: 1 },
      { book: book('b'), score: 0.9 },
    ]
    expect(pickDiverseSliceFromRanked(ranked, 3, undefined).map((b) => b.id)).toEqual(['a', 'b'])
    expect(pickDiverseSliceFromRanked(ranked, 1, { windowSize: 10, round: 0 }).map((b) => b.id)).toEqual(['a'])
  })

  it('slides window by round within top M', () => {
    const ranked = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ book: book(id), score: 1 - i * 0.01 }))
    const d = { windowSize: 5, round: 0 }
    expect(pickDiverseSliceFromRanked(ranked, 3, d).map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(pickDiverseSliceFromRanked(ranked, 3, { windowSize: 5, round: 1 }).map((b) => b.id)).toEqual(['b', 'c', 'd'])
    expect(pickDiverseSliceFromRanked(ranked, 3, { windowSize: 5, round: 2 }).map((b) => b.id)).toEqual(['c', 'd', 'e'])
  })

  it('returns empty for empty input', () => {
    expect(pickDiverseSliceFromRanked([], 3, { windowSize: 10, round: 0 })).toEqual([])
  })

  it('does not repeat the same book id after dedupeRankedBookEntries', () => {
    const dupRanked = [
      { book: book('x'), score: 1 },
      { book: book('x'), score: 0.5 },
      { book: book('y'), score: 0.9 },
      { book: book('z'), score: 0.8 },
    ]
    const deduped = dedupeRankedBookEntries(dupRanked)
    expect(deduped.map((e) => e.book.id)).toEqual(['x', 'y', 'z'])
    expect(pickDiverseSliceFromRanked(deduped, 3, undefined).map((b) => b.id)).toEqual(['x', 'y', 'z'])
  })

  it('collapses same title+authors with different ids', () => {
    const a: BookPreview = {
      id: 'id1',
      title: 'Same Title',
      authors: 'Same Author',
      coverImageUrl: '',
      kdcClassName: '',
      sector: 1,
    }
    const b: BookPreview = { ...a, id: 'id2', sector: 2 }
    const ranked = [
      { book: a, score: 1 },
      { book: b, score: 0.9 },
      { book: book('other'), score: 0.5 },
    ]
    const deduped = dedupeRankedBookEntries(ranked)
    expect(deduped.map((e) => e.book.id)).toEqual(['id1', 'other'])
  })
})

describe('dedupeBookPreviewList', () => {
  it('preserves order and removes duplicate ids and title signatures', () => {
    const base: BookPreview = {
      id: 'id-a',
      title: 'Shared',
      authors: 'Author',
      coverImageUrl: '',
      kdcClassName: '',
      sector: 0,
    }
    const dupTitle = { ...base, id: 'id-b' }
    const other = book('z')
    expect(dedupeBookPreviewList([base, dupTitle, other])).toHaveLength(2)
  })
})
