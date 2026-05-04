import { describe, expect, it } from 'vitest'
import type { ToolCall } from '../../agent/types'
import { mergePlannedToolCall } from './toolCallMerge'

describe('mergePlannedToolCall', () => {
  it('prefers planner title hint over full user utterance when planner gives a concrete title', () => {
    const deterministic: ToolCall = {
      name: 'shoppingListTool',
      args: {
        action: 'remove',
        hint: '리스트에 당신의 모든 순간 두 권 다 삭제해줘',
      },
    }
    const planned: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'remove', hint: '당신의 모든 순간' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'remove_book')
    expect(merged?.args.hint).toBe('당신의 모든 순간')
  })

  it('keeps deterministic remove hint when planner sends command-only hint', () => {
    const deterministic: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'remove', hint: '시원스쿨 기초영어법 삭제해줘' },
    }
    const planned: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'remove', hint: '삭제해줘' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'remove_book')
    expect(merged?.args.action).toBe('remove')
    expect(merged?.args.hint).toBe('시원스쿨 기초영어법 삭제해줘')
  })

  it('keeps deterministic remove action when planner sends invalid action', () => {
    const deterministic: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'remove', hint: '시원스쿨 기초영어법 삭제해줘' },
    }
    const planned: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'delete', hint: '시원스쿨 기초영어법' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'remove_book')
    expect(merged?.args.action).toBe('remove')
  })

  it('keeps deterministic add hint when planner hint is empty', () => {
    const deterministic: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'add', hint: '데미안 추가해줘' },
    }
    const planned: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'add', hint: '' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'add_book')
    expect(merged?.args.hint).toBe('데미안 추가해줘')
  })

  it('drops mismatched planner tool when list-edit intent uses shoppingListTool', () => {
    const deterministic: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'remove', hint: '시원스쿨 기초영어법 삭제해줘' },
    }
    const planned: ToolCall = {
      name: 'recommendationTool',
      args: { mode: 'taste' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'remove_book')
    expect(merged?.name).toBe('shoppingListTool')
    expect(merged?.args.hint).toBe('시원스쿨 기초영어법 삭제해줘')
  })

  it('still allows planner args for non-list-edit intents', () => {
    const deterministic: ToolCall = {
      name: 'recommendationTool',
      args: { mode: 'taste' },
    }
    const planned: ToolCall = {
      name: 'recommendationTool',
      args: { mode: 'location' },
    }

    const merged = mergePlannedToolCall(deterministic, planned, 'request_recommendation')
    expect(merged?.args.mode).toBe('location')
  })

  it('normalizes delete action even when intent is unknown', () => {
    const planned: ToolCall = {
      name: 'shoppingListTool',
      args: { action: 'delete', hint: '시원스쿨 기초영어법' },
    }

    const merged = mergePlannedToolCall(null, planned, 'unknown')
    expect(merged?.args.action).toBe('remove')
  })
})
