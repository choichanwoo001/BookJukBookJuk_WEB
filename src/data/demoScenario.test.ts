import { describe, expect, it } from 'vitest'
import { DEMO_BOOKS, findDemoBookByTitle, demoPoolIndicesForKeys } from '../data/demoScenario'
import { bookKeysToPoolIndices } from '../utils/bookShelfNavigation'

describe('demoScenario', () => {
  it('defines four demo books', () => {
    expect(Object.keys(DEMO_BOOKS)).toHaveLength(4)
  })

  it('finds demo book by partial title', () => {
    expect(findDemoBookByTitle('어른이 된다는 것')?.key).toBe('book1')
    expect(findDemoBookByTitle('시선으로부터')?.key).toBe('alternative')
  })

  it('maps book keys to pool indices', () => {
    const indices = bookKeysToPoolIndices(['book1', 'book2'])
    expect(indices).toEqual([
      DEMO_BOOKS.book1.poolIndex,
      DEMO_BOOKS.book2.poolIndex,
    ])
    expect(demoPoolIndicesForKeys(['alternative'])).toEqual([DEMO_BOOKS.alternative.poolIndex])
  })
})
