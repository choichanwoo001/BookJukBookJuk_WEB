import { beforeEach, describe, expect, it, vi } from 'vitest'

const completeDemoPurchaseMock = vi.hoisted(() => vi.fn())
const buildLocalReceiptMock = vi.hoisted(() => vi.fn())
const tryPublishVersoCommandMock = vi.hoisted(() => vi.fn())

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
  dispatchMapCommand: vi.fn(),
  dispatchDwellEvent: vi.fn(),
}))

vi.mock('../../config/demoMode', () => ({
  isDemoMode: () => false,
}))

import { checkoutTool } from './checkoutTool'
import type { AgentContext, CartItem, Receipt, ToolExecutionContext } from '../types'

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
    tryPublishVersoCommandMock.mockReturnValue(true)
  })

  it('rejects checkout when the cart is empty', async () => {
    const exec = makeCtx([])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('CART_EMPTY')
    expect(completeDemoPurchaseMock).not.toHaveBeenCalled()
  })

  it('moves to checkout, creates a receipt, clears cart, and ends dwell feedback', async () => {
    const receipt: Receipt = {
      receiptId: 'receipt-1',
      usersId: 'user-1',
      items: [item],
      purchasedAt: '2026-06-06T00:00:00.000Z',
      qrPayload: 'bookjuk://receipt?receiptId=receipt-1&usersId=user-1',
    }
    completeDemoPurchaseMock.mockResolvedValue({ ok: true, data: receipt })

    const exec = makeCtx([item])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(true)
    expect(tryPublishVersoCommandMock).toHaveBeenCalledWith('go_checkout')
    expect(completeDemoPurchaseMock).toHaveBeenCalledWith({ usersId: 'user-1', items: [item] })
    expect(exec.getContext().checkoutStatus).toBe('completed')
    expect(exec.getContext().receipt).toEqual(receipt)
    expect(exec.getContext().cartItems).toEqual([])
    expect(exec.getContext().shoppingList).toEqual([])
    expect(exec.getContext().pendingDwellBook).toBeNull()
    expect(exec.getContext().awaitingDwellFeedback).toBe(false)
  })

  it('falls back to a local receipt when Supabase is not configured', async () => {
    const localReceipt: Receipt = {
      receiptId: 'local-1',
      usersId: 'user-1',
      items: [item],
      purchasedAt: '2026-06-06T00:00:00.000Z',
      qrPayload: 'bookjuk://receipt?receiptId=local-1&usersId=user-1',
    }
    completeDemoPurchaseMock.mockResolvedValue({
      ok: false,
      errorCode: 'SUPABASE_NOT_CONFIGURED',
      message: 'not configured',
    })
    buildLocalReceiptMock.mockReturnValue(localReceipt)

    const exec = makeCtx([item])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(true)
    expect(buildLocalReceiptMock).toHaveBeenCalledWith('user-1', [item])
    expect(exec.getContext().receipt).toEqual(localReceipt)
  })
})
