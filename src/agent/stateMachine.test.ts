import { describe, expect, it } from 'vitest'
import { transitionStateFromTool } from './stateMachine'
import type { ToolResult } from './types'

describe('transitionStateFromTool', () => {
  it('moves to GOAL_CHECK from NAV_EXEC on goalCheckTool success', () => {
    const r: ToolResult = { ok: true, toolName: 'goalCheckTool', message: 'ok', data: { checked: true } }
    expect(transitionStateFromTool('NAV_EXEC', r)).toBe('GOAL_CHECK')
  })

  it('keeps state on shoppingList failure', () => {
    const r: ToolResult = { ok: false, toolName: 'shoppingListTool', message: 'fail', errorCode: 'X' }
    expect(transitionStateFromTool('LIST_EDIT', r)).toBe('LIST_EDIT')
  })
})
