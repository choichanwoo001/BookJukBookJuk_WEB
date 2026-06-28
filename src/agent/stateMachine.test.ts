import { describe, expect, it } from 'vitest'
import { transitionStateFromTool } from './stateMachine'
import type { ToolResult } from './types'

describe('transitionStateFromTool', () => {
  it('moves to LIST_EDIT on shoppingListTool success', () => {
    const r: ToolResult = { ok: true, toolName: 'shoppingListTool', message: 'ok' }
    expect(transitionStateFromTool('MODE_SELECT', r)).toBe('LIST_EDIT')
  })

  it('keeps state on shoppingList failure', () => {
    const r: ToolResult = { ok: false, toolName: 'shoppingListTool', message: 'fail', errorCode: 'X' }
    expect(transitionStateFromTool('LIST_EDIT', r)).toBe('LIST_EDIT')
  })
})
