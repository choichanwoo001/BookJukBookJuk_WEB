import { describe, expect, it, vi } from 'vitest'
import { parseIntent } from './intentParser'
import { mapIntentToTool } from './runtime/mapIntentToTool'
import { transitionStateFromIntent, transitionStateFromTool } from './stateMachine'
import { validateShoppingListArgs } from './tools/toolValidators'
import type { AgentState, ToolResult } from './types'
import { handleBuildFlowInput, initialBuildFlowSession } from '../hooks/chatAgent/buildFlow'
import { isProceedToken } from '../hooks/chatAgent/proceedToken'

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
  it('maps "계획 없음" to browse mode intent', () => {
    const intent = parseIntent('계획 없음', 'chat')
    expect(intent.type).toBe('select_browse_mode')
  })

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

  it('keeps remove intent for suffix-form sentence', () => {
    const intent = parseIntent('시원스쿨 기초영어법 삭제해줘', 'chat')
    const mapped = mapIntentToTool(intent)
    expect(intent.type).toBe('remove_book')
    expect(mapped?.name).toBe('shoppingListTool')
    expect(mapped?.args.action).toBe('remove')
  })

  it('keeps remove intent for topic-particle suffix sentence', () => {
    const intent = parseIntent('시원스쿨 시초영어법은 삭제해줘', 'chat')
    const mapped = mapIntentToTool(intent)
    expect(intent.type).toBe('remove_book')
    expect(mapped?.name).toBe('shoppingListTool')
    expect(mapped?.args.action).toBe('remove')
  })

  it('parses slash robot proceed command', () => {
    const intent = parseIntent('/로봇 진행', 'chat')
    expect(intent.type).toBe('resume_mobility')
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
  it('rejects deprecated actions (changeType/updateQuantity)', () => {
    expect(validateShoppingListArgs({ action: 'changeType' })).toContain('add/remove만 지원')
    expect(validateShoppingListArgs({ action: 'updateQuantity' })).toContain('add/remove만 지원')
  })
})

describe('build flow boundaries', () => {
  it('caps theme regeneration after 2 tries', async () => {
    const appendSpy = vi.fn(async () => undefined)
    const loadThemesSpy = vi.fn(async () => [])
    const handled = await handleBuildFlowInput({
      buildFlow: {
        ...initialBuildFlowSession(),
        step: 'step2_theme_select',
        answers: ['질문1', '질문2'],
        themes: [],
        themeRegenerateCount: 2,
      },
      intentText: '다시 추천',
      appendAssistantAndStore: appendSpy,
      setBuildFlow: vi.fn(),
      loadThemesForAnswers: loadThemesSpy,
      loadCandidatesForTheme: vi.fn(async () => []),
      runToolWithFallback: vi.fn(async () => ({
        ok: true,
        toolName: 'shoppingListTool',
        message: 'noop',
      })),
      getShoppingListCount: () => 0,
    })
    expect(handled).toBe(true)
    expect(loadThemesSpy).not.toHaveBeenCalled()
    expect(appendSpy).toHaveBeenCalledWith('테마 재추천은 여기까지 가능해요. 현재 제안에서 골라 주세요.')
  })

  it('keeps confirmed step closed for new picks', async () => {
    const appendSpy = vi.fn(async () => undefined)
    const handled = await handleBuildFlowInput({
      buildFlow: {
        ...initialBuildFlowSession(),
        step: 'confirmed',
      },
      intentText: '한 권 더 고르기',
      appendAssistantAndStore: appendSpy,
      setBuildFlow: vi.fn(),
      loadThemesForAnswers: vi.fn(async () => []),
      loadCandidatesForTheme: vi.fn(async () => []),
      runToolWithFallback: vi.fn(async () => ({
        ok: true,
        toolName: 'shoppingListTool',
        message: 'noop',
      })),
      getShoppingListCount: () => 0,
    })
    expect(handled).toBe(true)
    expect(appendSpy).toHaveBeenCalledWith('리스트는 이미 확정된 상태예요. 새로 고르려면 시작 모드를 다시 선택해 주세요.')
  })

  it('keeps AB step when all add attempts fail', async () => {
    const appendSpy = vi.fn(async () => undefined)
    const setBuildFlowSpy = vi.fn()
    const handled = await handleBuildFlowInput({
      buildFlow: {
        ...initialBuildFlowSession(),
        step: 'step3_ab_pick',
        candidates: [
          { title: 'A책', authors: '저자A', reason: 'r', reviewKeywords: [] },
          { title: 'B책', authors: '저자B', reason: 'r', reviewKeywords: [] },
        ],
      },
      intentText: 'A 담기',
      appendAssistantAndStore: appendSpy,
      setBuildFlow: setBuildFlowSpy,
      loadThemesForAnswers: vi.fn(async () => []),
      loadCandidatesForTheme: vi.fn(async () => []),
      runToolWithFallback: vi.fn(async () => ({
        ok: false,
        toolName: 'shoppingListTool',
        message: '실패',
        errorCode: 'BOOK_NOT_IN_CATALOG',
      })),
      getShoppingListCount: () => 0,
    })
    expect(handled).toBe(true)
    expect(setBuildFlowSpy).not.toHaveBeenCalledWith(expect.any(Function))
    expect(appendSpy).toHaveBeenCalledWith(
      '선택한 책을 리스트에 담지 못했어요. A/B 중 다시 선택하거나 다른 2권 보기를 시도해 주세요.',
    )
  })

  it('uses latest shopping list count after successful add', async () => {
    const appendSpy = vi.fn(async () => undefined)
    const handled = await handleBuildFlowInput({
      buildFlow: {
        ...initialBuildFlowSession(),
        step: 'step3_ab_pick',
        candidates: [
          { title: 'A책', authors: '저자A', reason: 'r', reviewKeywords: [] },
          { title: 'B책', authors: '저자B', reason: 'r', reviewKeywords: [] },
        ],
      },
      intentText: 'A 담기',
      appendAssistantAndStore: appendSpy,
      setBuildFlow: vi.fn(),
      loadThemesForAnswers: vi.fn(async () => []),
      loadCandidatesForTheme: vi.fn(async () => []),
      runToolWithFallback: vi.fn(async () => ({
        ok: true,
        toolName: 'shoppingListTool',
        message: '성공',
        data: { shoppingList: [] },
      })),
      getShoppingListCount: () => 3,
    })
    expect(handled).toBe(true)
    expect(appendSpy).toHaveBeenLastCalledWith('현재 리스트는 3권이에요. 이 리스트로 확정할까요?')
  })
})

describe('existing-list proceed token', () => {
  it('accepts slash robot proceed commands', () => {
    expect(isProceedToken('/로봇 진행')).toBe(true)
    expect(isProceedToken('/진행')).toBe(true)
  })
})
