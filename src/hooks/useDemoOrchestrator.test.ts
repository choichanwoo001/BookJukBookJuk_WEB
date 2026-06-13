import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionContext } from '../agent/types'

const completeCheckoutPurchaseMock = vi.hoisted(() => vi.fn())

vi.mock('../config/demoMode', () => ({
  isDemoMode: () => true,
}))

vi.mock('../agent/tools/checkoutCompletion', () => ({
  completeCheckoutPurchase: completeCheckoutPurchaseMock,
}))

import {
  AGENT_MAP_EVENT_VERSION,
  dispatchDwellEvent,
} from '../agent/runtime/agentEventBus'
import { DEMO_BOOKS, demoBookToEntry } from '../data/demoScenario'
import {
  buildDemoArrivalDedupeKey,
  claimDemoArrivalEvent,
  useDemoOrchestrator,
} from './useDemoOrchestrator'

function makeDeps() {
  return {
    toolExecutionContext: {
      getContext: vi.fn(),
      setContext: vi.fn(),
    } as unknown as ToolExecutionContext,
    enqueueAssistant: vi.fn(),
    enqueueAssistantMany: vi.fn(),
    setContext: vi.fn(),
  }
}

describe('useDemoOrchestrator arrival-gated messages', () => {
  beforeEach(() => {
    completeCheckoutPurchaseMock.mockReset()
  })

  it('builds stable arrival de-dupe keys', () => {
    expect(
      buildDemoArrivalDedupeKey(3, {
        type: 'SHELF_ARRIVED',
        legIndex: 1,
        poolIndex: 27,
      }),
    ).toBe('3:shelf:1:27')
    expect(buildDemoArrivalDedupeKey(3, { type: 'CHECKOUT_ARRIVED' })).toBe('3:checkout')
  })

  it('claims each arrival event only once per navigation run', () => {
    const processed = new Set<string>()
    const event = { type: 'SHELF_ARRIVED' as const, legIndex: 0, poolIndex: 27 }

    expect(claimDemoArrivalEvent(processed, 1, event)).toBe(true)
    expect(claimDemoArrivalEvent(processed, 1, event)).toBe(false)
    expect(claimDemoArrivalEvent(processed, 2, event)).toBe(true)
  })

  it('does not enqueue shelf arrival messages before SHELF_ARRIVED and de-dupes duplicates', async () => {
    const deps = makeDeps()
    const { result, unmount } = renderHook(() => useDemoOrchestrator(deps))

    result.current.startShelfVisitFromList([demoBookToEntry(DEMO_BOOKS.book1)])

    expect(deps.enqueueAssistant).not.toHaveBeenCalled()
    expect(deps.enqueueAssistantMany).not.toHaveBeenCalled()

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: DEMO_BOOKS.book1.poolIndex,
    })

    await waitFor(() => {
      expect(deps.enqueueAssistantMany).toHaveBeenCalledTimes(1)
    })
    const items = deps.enqueueAssistantMany.mock.calls[0][0]
    expect(items).toHaveLength(2)
    expect(items[0].text).toContain(DEMO_BOOKS.book1.title)
    expect(items[0].gate).toEqual({ kind: 'on_shelf_arrived', leg: 0 })
    expect(items[1].text).toContain('첫 번째 책')

    dispatchDwellEvent({
      type: 'SHELF_ARRIVED',
      version: AGENT_MAP_EVENT_VERSION,
      legIndex: 0,
      poolIndex: DEMO_BOOKS.book1.poolIndex,
    })

    expect(deps.enqueueAssistantMany).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('completes checkout only after CHECKOUT_ARRIVED and de-dupes duplicates', async () => {
    completeCheckoutPurchaseMock.mockResolvedValue({
      ok: true,
      toolName: 'checkoutTool',
      message: '구매를 완료했어요.',
    })
    const deps = makeDeps()
    const { unmount } = renderHook(() => useDemoOrchestrator(deps))

    expect(completeCheckoutPurchaseMock).not.toHaveBeenCalled()
    expect(deps.enqueueAssistant).not.toHaveBeenCalled()

    dispatchDwellEvent({ type: 'CHECKOUT_ARRIVED', version: AGENT_MAP_EVENT_VERSION })

    await waitFor(() => {
      expect(completeCheckoutPurchaseMock).toHaveBeenCalledTimes(1)
    })
    expect(deps.enqueueAssistant).toHaveBeenCalledWith({
      text: '구매를 완료했어요.',
      gate: { kind: 'on_checkout_arrived' },
    })

    dispatchDwellEvent({ type: 'CHECKOUT_ARRIVED', version: AGENT_MAP_EVENT_VERSION })

    expect(completeCheckoutPurchaseMock).toHaveBeenCalledTimes(1)
    expect(deps.enqueueAssistant).toHaveBeenCalledTimes(1)
    unmount()
  })
})
