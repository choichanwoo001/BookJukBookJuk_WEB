import { describe, expect, it } from 'vitest'
import { transitionStateFromIntent, transitionStateFromTool } from './stateMachine'
import { validateShoppingListArgs } from './tools/toolValidators'
import type { ToolResult } from './types'
import { isProceedToken } from '../hooks/chatAgent/proceedToken'

describe('scenario state transitions', () => {
  it('enters mode selection from INIT on the first intent', () => {
    expect(transitionStateFromIntent('INIT', 'select_browse_mode')).toBe('MODE_SELECT')
  })

  it('moves recommendation requests to discovery from an active mode', () => {
    expect(transitionStateFromIntent('MODE_SELECT', 'request_recommendation')).toBe('RECO_DISCOVERY')
  })
})

describe('post-tool state transition', () => {
  it('keeps RECO_DISCOVERY after a successful recommendation tool result', () => {
    const result: ToolResult = {
      ok: true,
      toolName: 'recommendationTool',
      message: 'mock',
      data: { recommendations: ['a', 'b'], source: 'mock' },
    }

    expect(transitionStateFromTool('RECO_DISCOVERY', result)).toBe('RECO_DISCOVERY')
  })
})

describe('shopping list action validation', () => {
  it('rejects deprecated actions', () => {
    expect(validateShoppingListArgs({ action: 'changeType' })).not.toBeNull()
    expect(validateShoppingListArgs({ action: 'updateQuantity' })).not.toBeNull()
  })
})

describe('existing-list proceed token', () => {
  it('accepts ASCII proceed commands', () => {
    expect(isProceedToken('ok')).toBe(true)
    expect(isProceedToken('start')).toBe(true)
  })
})
