import { beforeEach, describe, expect, it, vi } from 'vitest'

const createKakaoPaySessionMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase/env', () => ({
  getDefaultUserId: () => 'demo-user',
}))

vi.mock('../../lib/payment/kakaoPayClient', () => ({
  createKakaoPaySession: createKakaoPaySessionMock,
}))

import { checkoutTool } from './checkoutTool'
import type { AgentContext, CartItem, ToolExecutionContext } from '../types'

const item: CartItem = {
  booksId: 'book-1',
  title: '작별하지 않는다',
  authors: '한강',
  coverImageUrl: 'cover.jpg',
}

const paySession = {
  orderId: 'order-1',
  amountKrw: 15000,
  itemCount: 1,
  qrPayload: 'https://mockup-pg-web.kakao.com/v1/xxxxxxxxxx/mInfo',
  lineItems: [{ ...item, priceKrw: 15000 }],
  itemName: '작별하지 않는다',
  status: 'pending' as const,
  createdAt: '2026-06-14T00:00:00.000Z',
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
    skippedDwellBook: null,
    extendedRouteActive: false,
    transitDetourPhase: 'idle' as const,
    resumeLegAfterDetour: null,
    checkoutStatus: 'idle',
    receipt: null,
    kakaoPaySession: null,
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
    createKakaoPaySessionMock.mockReset()
    createKakaoPaySessionMock.mockResolvedValue({ ok: true, session: paySession })
  })

  it('rejects checkout when the cart is empty', async () => {
    const exec = makeCtx([])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('CART_EMPTY')
    expect(createKakaoPaySessionMock).not.toHaveBeenCalled()
  })

  it('creates a Kakao Pay session with a real payment QR URL', async () => {
    const exec = makeCtx([item])
    const result = await checkoutTool.run({}, exec)

    expect(result.ok).toBe(true)
    expect(createKakaoPaySessionMock).toHaveBeenCalled()
    expect(result.message).toBe('카카오페이 QR을 스캔해 결제해 주세요.')
    expect(result.data).toEqual({ kakaoPaySession: paySession })
    expect(exec.getContext().checkoutStatus).toBe('awaiting_payment')
    expect(exec.getContext().kakaoPaySession).toEqual(paySession)
    expect(exec.getContext().kakaoPaySession?.qrPayload).toMatch(/^https:\/\//)
  })
})
