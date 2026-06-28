import { getDefaultUserId } from '../../lib/supabase/env'
import { createKakaoPaySession } from '../../lib/payment/kakaoPayClient'
import { buildKakaoPayLineItems } from '../../lib/payment/kakaoPay'
import type { ToolDefinition } from './types'
import { completeCheckoutPurchase } from './checkoutCompletion'

export const checkoutTool: ToolDefinition = {
  name: 'checkoutTool',
  validate() {
    return null
  },
  async run(_args, ctx) {
    const context = ctx.getContext()
    const cartItems = context.cartItems.length > 0 ? context.cartItems : context.shoppingList
    if (cartItems.length === 0) {
      return {
        ok: false,
        toolName: 'checkoutTool',
        message: '장바구니가 비어 있어요. 구매할 책을 먼저 담아 주세요.',
        errorCode: 'CART_EMPTY',
      }
    }

    const lineItems = buildKakaoPayLineItems(cartItems)
    const partnerUserId = context.activeUsersId ?? getDefaultUserId()
    const ready = await createKakaoPaySession({ partnerUserId, lineItems })
    if (!ready.ok) {
      return {
        ok: false,
        toolName: 'checkoutTool',
        message: ready.message,
        errorCode: ready.errorCode ?? 'KAKAO_PAY_READY_FAILED',
      }
    }

    ctx.setContext({
      kakaoPaySession: ready.session,
      checkoutStatus: 'awaiting_payment',
    })

    return {
      ok: true,
      toolName: 'checkoutTool',
      message: '카카오페이 QR을 스캔해 결제해 주세요.',
      data: { kakaoPaySession: ready.session },
    }
  },
}

export { completeCheckoutPurchase }
