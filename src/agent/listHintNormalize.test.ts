import { describe, expect, it } from 'vitest'
import {
  findBestFuzzyShoppingListMatch,
  matchShoppingListByTitleHint,
  normalizeListHint,
} from './listHintNormalize'

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

  it('matches when the hint contains the shelf title (long utterance)', () => {
    const row = { booksId: 'x', title: '당신의 모든 순간' }
    const hint =
      '리스트에 당신의 모든 순간 책이 두 개가 있는데 이거 둘 다 삭제해 줘 그냥'
    expect(matchShoppingListByTitleHint([row], hint)).toEqual([row])
  })
})

describe('findBestFuzzyShoppingListMatch', () => {
  it('matches a one- to two-character typo when the closest title is unique', () => {
    const list = [
      { booksId: 'a', title: '시원스쿨 기초영어법' },
      { booksId: 'b', title: '넛지 : 똑똑한 선택을 이끄는 힘' },
    ]
    expect(findBestFuzzyShoppingListMatch(list, '시원스쿨 기초영업법')).toEqual(list[0])
    expect(matchShoppingListByTitleHint(list, '시원스쿨 기초영업법')).toEqual([])
  })

  it('ignores spacing differences between hint and shelf title', () => {
    const list = [{ booksId: 'a', title: '시원스쿨 기초영어법' }]
    expect(findBestFuzzyShoppingListMatch(list, '시원스쿨 기초 영업법')).toEqual(list[0])
  })

  it('returns null when two list titles tie for edit distance', () => {
    const list = [
      { booksId: '1', title: '코스 기초영어법' },
      { booksId: '2', title: '코스 기초영업법' },
    ]
    expect(matchShoppingListByTitleHint(list, '코스 기초영음법')).toEqual([])
    expect(findBestFuzzyShoppingListMatch(list, '코스 기초영음법')).toBeNull()
  })

  it('returns null when the hint is too far from every title', () => {
    const list = [{ booksId: 'x', title: '전혀 다른 책 제목입니다' }]
    expect(findBestFuzzyShoppingListMatch(list, '시원스쿨 기초영업법')).toBeNull()
  })
})
