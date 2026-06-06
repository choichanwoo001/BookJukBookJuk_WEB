import { beforeEach, describe, expect, it, vi } from 'vitest'

const findBookByIsbnOrTitleMock = vi.hoisted(() => vi.fn())
const findBookCandidatesByTitleMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase/books', () => ({
  findBookByIsbnOrTitle: findBookByIsbnOrTitleMock,
  findBookCandidatesByTitle: findBookCandidatesByTitleMock,
}))

vi.mock('../../lib/supabase/cache', () => ({
  getBookCacheHint: vi.fn().mockResolvedValue({ ok: false }),
}))

vi.mock('../listHintNormalize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../listHintNormalize')>()
  return {
    ...actual,
    shoppingListSkipRecognition: () => true,
  }
})

vi.mock('../bridges/bookRecognitionBridge', () => ({
  getBookRecognitionClient: () => ({
    identifyBook: vi.fn().mockResolvedValue({
      ok: false,
      message: 'mock skip',
      errorCode: 'BOOK_NOT_RECOGNIZED',
    }),
  }),
}))

import { shoppingListTool } from './shoppingListTool'
import type { AgentContext, ToolExecutionContext } from '../types'

function makeCtx(cartItems: AgentContext['cartItems']): ToolExecutionContext {
  let ctx: AgentContext = {
    state: 'INIT',
    mobilityPaused: false,
    listType: '위시리스트',
    recentlyRecommendedBookIds: [],
    recommendationDiversityRound: 0,
    pendingConfirmation: null,
    lastToolResult: null,
    shoppingList: cartItems,
    cartItems,
    pendingDwellBook: null,
    awaitingDwellFeedback: false,
    checkoutStatus: 'idle',
    receipt: null,
  }
  return {
    getContext: () => ctx,
    setContext: (patch) => {
      ctx = { ...ctx, ...patch }
    },
  }
}

describe('shoppingListTool cart behavior', () => {
  beforeEach(() => {
    findBookByIsbnOrTitleMock.mockReset()
    findBookByIsbnOrTitleMock.mockResolvedValue({ ok: true, data: null })
    findBookCandidatesByTitleMock.mockReset()
    findBookCandidatesByTitleMock.mockResolvedValue({ ok: true, data: [] })
  })

  it('removes every cart row that shares the same title', async () => {
    const list = [
      { booksId: 'a', title: '당신의 모든 순간', authors: '', coverImageUrl: '' },
      { booksId: 'b', title: '당신의 모든 순간', authors: '', coverImageUrl: '' },
    ]
    const exec = makeCtx(list)
    const res = await shoppingListTool.run({ action: 'remove', hint: '당신의 모든 순간 삭제해줘' }, exec)

    expect(res.ok).toBe(true)
    expect(exec.getContext().cartItems).toHaveLength(0)
    expect(exec.getContext().shoppingList).toHaveLength(0)
    expect(res.message).toContain('2권')
  })

  it('returns LIST_REMOVE_UNMATCHED when the cart is non-empty but no row matches', async () => {
    const list = [{ booksId: 'a', title: '미움받을 용기', authors: '', coverImageUrl: '' }]
    const exec = makeCtx(list)
    const res = await shoppingListTool.run(
      { action: 'remove', hint: '완전없는제목xyz123 삭제해줘' },
      exec,
    )

    expect(res.ok).toBe(false)
    expect(res.errorCode).toBe('LIST_REMOVE_UNMATCHED')
  })

  it('returns BOOK_NOT_IN_CATALOG when the cart is empty and catalog has no match', async () => {
    const exec = makeCtx([])
    const res = await shoppingListTool.run(
      { action: 'remove', hint: '존재하지않는고유제목999 삭제해줘' },
      exec,
    )

    expect(res.ok).toBe(false)
    expect(res.errorCode).toBe('BOOK_NOT_IN_CATALOG')
  })

  it('adds a catalog match to the session cart without requiring a shelf write', async () => {
    findBookByIsbnOrTitleMock.mockResolvedValueOnce({
      ok: true,
      data: { id: 'book-1', title: '작별하지 않는다', authors: '한강', coverImageUrl: 'cover.jpg' },
    })
    const exec = makeCtx([])
    const res = await shoppingListTool.run({ action: 'add', hint: '작별하지 않는다 카트에 담아줘' }, exec)

    expect(res.ok).toBe(true)
    expect(exec.getContext().cartItems).toEqual([
      { booksId: 'book-1', title: '작별하지 않는다', authors: '한강', coverImageUrl: 'cover.jpg' },
    ])
    expect(exec.getContext().shoppingList).toEqual(exec.getContext().cartItems)
  })
})
