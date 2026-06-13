import { beforeEach, describe, expect, it, vi } from 'vitest'

const completeDemoPurchaseMock = vi.hoisted(() => vi.fn())
const buildLocalReceiptMock = vi.hoisted(() => vi.fn())
const tryPublishVersoCommandMock = vi.hoisted(() => vi.fn())
const dispatchMapCommandMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase/env', () => ({
  getDefaultUserId: () => 'demo-user',
}))

vi.mock('../../lib/supabase/purchases', () => ({
  completeDemoPurchase: completeDemoPurchaseMock,
  buildLocalReceipt: buildLocalReceiptMock,
}))

vi.mock('../../lib/supabase/result', () => ({
  SUPABASE_NOT_CONFIGURED: 'SUPABASE_NOT_CONFIGURED',
}))

vi.mock('../../lib/verso/versoCommandBridge', () => ({
  tryPublishVersoCommand: tryPublishVersoCommandMock,
}))

vi.mock('../runtime/agentEventBus', () => ({
  AGENT_MAP_EVENT_VERSION: 1,
  dispatchMapCommand: dispatchMapCommandMock,
  dispatchDwellEvent: vi.fn(),
}))

vi.mock('../../config/demoMode', () => ({
  isDemoMode: () => false,
}))

import { checkoutTool } from './checkoutTool'
import type { AgentContext, CartItem, ToolExecutionContext } from '../types'

const item: CartItem = {
  booksId: 'book-1',
  title: '작별하지 않는다',
  authors: '한강',
  coverImageUrl: 'cover.jpg',
}

function makeCtx(cartItems: CartItem[]): ToolExecutionContext {
  let ctx: AgentContext = {
    state: 'INIT',
    mobilityPaused: true,
    listType: '위시리스트',
    shoppingList: cartItems,
    cartItems,
    pendingDwellBook: { ...item, detectedAt: Date.now(), source: 'cover' },
    awaitingDwellFeedback: true,
    checkoutStatus: 'idle',
    receipt: null,
    recentlyRecommendedBookIds: [],
    recommendationDiversityRound: 0,
    pendingConfirmation: null,
    lastToolResult: null,
    activeUsersId: 'user-1',
  }
  return {
    getContext: () => ctx,
    setContext: (patch) => {
      ctx = { ...ctx, ...patch }
    },
  }
}

describe('checkoutTool', () => {
  beforeEach(() => {
    completeDemoPurchaseMock.mockReset()
    buildLocalReceiptMock.mockReset()
    tryPublishVersoCommandMock.mockReset()
    dispatchMapCommandMock.mockReset()
    tryPublishVersoCommandMock.mockReturnValue(true)
  })

  it('rejects checkout when the cart is empty', async () => {
    const exec = makeCtx([])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('CART_EMPTY')
    expect(completeDemoPurchaseMock).not.toHaveBeenCalled()
  })

  it('moves to checkout and defers purchase completion until arrival', async () => {
    const exec = makeCtx([item])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(true)
    expect(tryPublishVersoCommandMock).toHaveBeenCalledWith('go_checkout')
    expect(dispatchMapCommandMock).toHaveBeenCalledWith({ type: 'GO_CHECKOUT', version: 1 })
    expect(completeDemoPurchaseMock).not.toHaveBeenCalled()
    expect(buildLocalReceiptMock).not.toHaveBeenCalled()
    expect(result.data).toEqual({ deferred: true })
    expect(exec.getContext().checkoutStatus).toBe('going_to_counter')
    expect(exec.getContext().receipt).toBeNull()
    expect(exec.getContext().cartItems).toEqual([item])
    expect(exec.getContext().shoppingList).toEqual([item])
    expect(exec.getContext().pendingDwellBook).toEqual(expect.objectContaining({ booksId: item.booksId }))
    expect(exec.getContext().awaitingDwellFeedback).toBe(true)
  })
})
