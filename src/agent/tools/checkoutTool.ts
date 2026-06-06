import { getDefaultUserId } from '../../lib/supabase/env'
import { buildLocalReceipt, completeDemoPurchase } from '../../lib/supabase/purchases'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'
import { tryPublishVersoCommand } from '../../lib/verso/versoCommandBridge'
import { AGENT_MAP_EVENT_VERSION, dispatchDwellEvent, dispatchMapCommand } from '../runtime/agentEventBus'
import type { ToolDefinition } from './types'

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

    const usersId = context.activeUsersId ?? getDefaultUserId()
    ctx.setContext({ checkoutStatus: 'going_to_counter', mobilityPaused: false })
    const published = tryPublishVersoCommand('go_checkout')
    dispatchMapCommand({ type: 'GO_CHECKOUT', version: AGENT_MAP_EVENT_VERSION })

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
    dispatchDwellEvent({ type: 'CHECKOUT_ARRIVED', version: AGENT_MAP_EVENT_VERSION })
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
      message: published
        ? `계산대로 안내했어요. ${receipt.items.length}권 구매를 완료하고 전자 영수증을 만들었어요.`
        : `계산대 안내 데모를 완료했어요. ${receipt.items.length}권 구매 영수증을 만들었어요.`,
      data: { receipt },
    }
  },
}
