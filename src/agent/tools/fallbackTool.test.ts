import { describe, expect, it } from 'vitest'
import { fallbackTool } from './fallbackTool'
import type { ToolExecutionContext } from '../types'

const mockCtx: ToolExecutionContext = {
  getContext: () => ({
    state: 'INIT',
    mobilityPaused: false,
    listType: '쇼핑리스트',
    shoppingList: [],
    pendingConfirmation: null,
    lastToolResult: null,
  }),
  setContext: () => undefined,
}

describe('fallbackTool message policy', () => {
  it('returns store-not-found message for match failures', async () => {
    const resultNotInCatalog = await fallbackTool.run({ reason: 'BOOK_NOT_IN_CATALOG' }, mockCtx)
    const resultNotRecognized = await fallbackTool.run({ reason: 'BOOK_NOT_RECOGNIZED' }, mockCtx)

    expect(resultNotInCatalog.message).toBe('해당 책은 서점에 없습니다.')
    expect(resultNotRecognized.message).toBe('해당 책은 서점에 없습니다.')
  })

  it('returns temporary-system-failure message for infrastructure failures', async () => {
    const timeout = await fallbackTool.run({ reason: 'BRIDGE_TIMEOUT' }, mockCtx)
    const badGateway = await fallbackTool.run({ reason: 'HTTP_BAD_GATEWAY' }, mockCtx)
    const generic5xx = await fallbackTool.run({ reason: 'HTTP_503' }, mockCtx)

    expect(timeout.message).toBe('지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.')
    expect(badGateway.message).toBe('지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.')
    expect(generic5xx.message).toBe('지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.')
  })
})
