import { describe, expect, it } from 'vitest'
import { matchShoppingListByTitleHint, normalizeListHint } from './listHintNormalize'

describe('normalizeListHint', () => {
  it('strips add command prefixes', () => {
    expect(normalizeListHint('책 추가 미움받을 용기', 'add')).toBe('미움받을 용기')
    expect(normalizeListHint('책추가 해리포터', 'add')).toBe('해리포터')
    expect(normalizeListHint('추가 데미안', 'add')).toBe('데미안')
  })

  it('strips suffix-based polite phrases', () => {
    expect(normalizeListHint('시원스쿨 기초영어법 삭제해줘', 'remove')).toBe('시원스쿨 기초영어법')
    expect(normalizeListHint('데미안 추가해줘', 'add')).toBe('데미안')
    expect(normalizeListHint('리스트에 미움받을 용기 넣어줘', 'add')).toBe('미움받을 용기')
  })

  it('drops filler words and punctuation', () => {
    expect(normalizeListHint('이거 데미안 좀 삭제해줘!!!', 'remove')).toBe('데미안')
    expect(normalizeListHint('please 미움받을 용기 추가해줘', 'add')).toBe('미움받을 용기')
  })

  it('strips remove command prefixes', () => {
    expect(normalizeListHint('책 제거 미움받을 용기', 'remove')).toBe('미움받을 용기')
    expect(normalizeListHint('삭제해 데미안', 'remove')).toBe('데미안')
  })

  it('returns empty when only command', () => {
    expect(normalizeListHint('책추가', 'add')).toBe('')
  })
})

describe('matchShoppingListByTitleHint', () => {
  const list = [
    { booksId: '1', title: '미움받을 용기' },
    { booksId: '2', title: '데미안' },
  ]

  it('matches single substring case-insensitively', () => {
    expect(matchShoppingListByTitleHint(list, '미움')).toEqual([list[0]])
    expect(matchShoppingListByTitleHint(list, '데미')).toEqual([list[1]])
  })

  it('returns all partial matches', () => {
    const many = [
      { booksId: 'a', title: '해리포터 1' },
      { booksId: 'b', title: '해리포터 2' },
    ]
    expect(matchShoppingListByTitleHint(many, '해리')).toHaveLength(2)
  })

  it('returns empty for blank hint', () => {
    expect(matchShoppingListByTitleHint(list, '   ')).toEqual([])
  })
})
