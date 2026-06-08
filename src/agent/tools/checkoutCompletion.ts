import { getDefaultUserId } from '../../lib/supabase/env'
import { buildLocalReceipt, completeDemoPurchase } from '../../lib/supabase/purchases'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'
import type { ToolExecutionContext, ToolResult } from '../types'

export async function completeCheckoutPurchase(ctx: ToolExecutionContext): Promise<ToolResult> {
  const context = ctx.getContext()
  const cartItems = context.cartItems.length > 0 ? context.cartItems : context.shoppingList
  if (cartItems.length === 0) {
    return {
      ok: false,
      toolName: 'checkoutTool',
      message: '장바구니가 비어 있어요.',
      errorCode: 'CART_EMPTY',
    }
  }

  const usersId = context.activeUsersId ?? getDefaultUserId()
  const purchase = await completeDemoPurchase({ usersId, items: cartItems })
  if (!purchase.ok && purchase.errorCode !== SUPABASE_NOT_CONFIGURED) {
    ctx.setContext({ checkoutStatus: 'error' })
    return {
      ok: false,
      toolName: 'checkoutTool',
      message: purchase.message ?? '전자 영수증을 만드는 중 문제가 생겼어요.',
      errorCode: purchase.errorCode,
    }
  }

  const receipt = purchase.ok ? purchase.data : buildLocalReceipt(usersId, cartItems)
  ctx.setContext({
    checkoutStatus: 'completed',
    receipt,
    cartItems: [],
    shoppingList: [],
    pendingDwellBook: null,
    awaitingDwellFeedback: false,
  })

  return {
    ok: true,
    toolName: 'checkoutTool',
    message: `${receipt.items.length}권 구매를 완료하고 전자 영수증을 만들었어요.`,
    data: { receipt },
  }
}

export function checkoutNavigationMessage(published: boolean): string {
  return published
    ? '계산대로 안내할게요. 도착하면 결제를 진행할게요.'
    : '계산대로 안내할게요. (로봇 미연결 — 화면 경로만 표시)'
}
