import { describe, expect, it } from 'vitest'
import { parseIntent } from './intentParser'
import { mapIntentToTool } from './runtime/mapIntentToTool'
import { transitionStateFromIntent, transitionStateFromTool } from './stateMachine'
import type { AgentState, ToolResult } from './types'

function runScenario(inputs: string[]): AgentState {
  let state: AgentState = 'INIT'
  for (const input of inputs) {
    const intent = parseIntent(input, 'chat')
    state = transitionStateFromIntent(state, intent.type)
  }
  return state
}

describe('scenario state transitions', () => {
  it('lands in NAV_EXEC or LIST_EDIT for the basic start scenario', () => {
    const state = runScenario(['쇼핑리스트 선택', '책 추가', '진행해'])
    expect(state === 'NAV_EXEC' || state === 'LIST_EDIT').toBe(true)
  })

  it('returns to NAV_EXEC after interrupt + resume', () => {
    const state = runScenario(['최단경로 재계산', '멈춰', '진행해'])
    expect(state).toBe('NAV_EXEC')
  })

  it('reaches RECO_DISCOVERY (or MODE_SELECT) on a recommendation request', () => {
    const state = runScenario(['추천해줘'])
    expect(state === 'RECO_DISCOVERY' || state === 'MODE_SELECT').toBe(true)
  })

  it('keeps MODE_SELECT for browse-mode entry', () => {
    const state = runScenario(['계획 없어'])
    expect(state).toBe('MODE_SELECT')
  })
})

describe('intent → tool mapping', () => {
  it('maps "추천해줘" to recommendationTool', () => {
    const intent = parseIntent('추천해줘', 'chat')
    const mapped = mapIntentToTool(intent)
    expect(mapped?.name).toBe('recommendationTool')
    expect(mapped?.args.mode).toBe('taste')
  })

  it('maps "최단경로 재계산" to routePlannerTool', () => {
    const intent = parseIntent('최단경로 재계산', 'chat')
    expect(mapIntentToTool(intent)?.name).toBe('routePlannerTool')
  })

  it('maps "검색 모비딕" to bookSearchTool', () => {
    const intent = parseIntent('책 검색 모비딕', 'chat')
    const mapped = mapIntentToTool(intent)
    expect(intent.type).toBe('search_books')
    expect(mapped?.name).toBe('bookSearchTool')
    expect(mapped?.args.query).toBe('모비딕')
  })

  it('keeps recommendation intent over generic search phrase', () => {
    const intent = parseIntent('추천해줘', 'chat')
    expect(intent.type).toBe('request_recommendation')
  })

  it('extracts quantity payload for list_update_quantity', () => {
    const intent = parseIntent('수량 3권으로 바꿔', 'chat')
    expect(intent.type).toBe('list_update_quantity')
    expect(intent.payload?.quantity).toBe(3)
  })

  it('keeps remove intent for suffix-form sentence', () => {
    const intent = parseIntent('시원스쿨 기초영어법 삭제해줘', 'chat')
    const mapped = mapIntentToTool(intent)
    expect(intent.type).toBe('remove_book')
    expect(mapped?.name).toBe('shoppingListTool')
    expect(mapped?.args.action).toBe('remove')
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
