import { tryPublishVersoCommand } from '../../lib/verso/versoCommandBridge'
import { AGENT_MAP_EVENT_VERSION, dispatchMapCommand } from '../runtime/agentEventBus'
import type { ToolDefinition } from './types'
import { checkoutNavigationMessage, completeCheckoutPurchase } from './checkoutCompletion'

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

    ctx.setContext({ checkoutStatus: 'going_to_counter', mobilityPaused: false })
    const published = tryPublishVersoCommand('go_checkout')
    dispatchMapCommand({ type: 'GO_CHECKOUT', version: AGENT_MAP_EVENT_VERSION })

    return {
      ok: true,
      toolName: 'checkoutTool',
      message: checkoutNavigationMessage(published),
      data: { deferred: true },
    }
  },
}

export { completeCheckoutPurchase }







