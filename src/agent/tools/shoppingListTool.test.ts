import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeBookFromShelfMock = vi.hoisted(() => vi.fn())
const findBookByIsbnOrTitleMock = vi.hoisted(() => vi.fn())
const findBookCandidatesByTitleMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase/shelves', () => ({
  mapListTypeToShelfType: (listType?: string) => {
    if (listType === '읽는중') return '읽는중'
    return '쇼핑리스트'
  },
  removeBookFromShelf: removeBookFromShelfMock,
  addBookToShelf: vi.fn(),
  updateBookUserState: vi.fn(),
}))

vi.mock('../../lib/supabase/books', () => ({
  findBookByIsbnOrTitle: findBookByIsbnOrTitleMock,
  findBookCandidatesByTitle: findBookCandidatesByTitleMock,
}))

vi.mock('../../lib/supabase/cache', () => ({
  getBookCacheHint: vi.fn().mockResolvedValue({ ok: false }),
}))

import { shoppingListTool } from './shoppingListTool'
import type { AgentContext, ToolExecutionContext } from '../types'

function makeCtx(shoppingList: AgentContext['shoppingList']): ToolExecutionContext {
  let ctx: AgentContext = {
    state: 'INIT',
    mobilityPaused: false,
    listType: '쇼핑리스트',
    recentlyRecommendedBookIds: [],
    recommendationDiversityRound: 0,
    pendingConfirmation: null,
    lastToolResult: null,
    shoppingList,
  }
  return {
    getContext: () => ctx,
    setContext: (patch) => {
      ctx = { ...ctx, ...patch }
    },
  }
}

describe('shoppingListTool remove', () => {
  beforeEach(() => {
    removeBookFromShelfMock.mockReset()
    removeBookFromShelfMock.mockResolvedValue({ ok: true })
    findBookByIsbnOrTitleMock.mockReset()
    findBookByIsbnOrTitleMock.mockResolvedValue({ ok: true, data: null })
    findBookCandidatesByTitleMock.mockReset()
    findBookCandidatesByTitleMock.mockResolvedValue({ ok: true, data: [] })
  })

  it('removes every shelf row that shares the same title', async () => {
    const list = [
      { booksId: 'a', title: '당신의 모든 순간', authors: '', coverImageUrl: '' },
      { booksId: 'b', title: '당신의 모든 순간', authors: '', coverImageUrl: '' },
    ]
    const exec = makeCtx(list)
    const res = await shoppingListTool.run({ action: 'remove', hint: '당신의 모든 순간 삭제해줘' }, exec)

    expect(res.ok).toBe(true)
    expect(removeBookFromShelfMock).toHaveBeenCalledTimes(2)
    expect(exec.getContext().shoppingList).toHaveLength(0)
    expect(res.message).toMatch(/2권/)
  })

  it('returns LIST_REMOVE_UNMATCHED when the list is non-empty but no row matches', async () => {
    const list = [{ booksId: 'a', title: '미움받을 용기', authors: '', coverImageUrl: '' }]
    const exec = makeCtx(list)
    const res = await shoppingListTool.run(
      { action: 'remove', hint: '완전히없는제목xyz123 삭제해줘' },
      exec,
    )

    expect(res.ok).toBe(false)
    expect(res.errorCode).toBe('LIST_REMOVE_UNMATCHED')
    expect(removeBookFromShelfMock).not.toHaveBeenCalled()
  })

  it('returns BOOK_NOT_IN_CATALOG when the list is empty and catalog has no match', async () => {
    const exec = makeCtx([])
    const res = await shoppingListTool.run(
      { action: 'remove', hint: '존재하지않는고유제목999 삭제해줘' },
      exec,
    )

    expect(res.ok).toBe(false)
    expect(res.errorCode).toBe('BOOK_NOT_IN_CATALOG')
  })
})
