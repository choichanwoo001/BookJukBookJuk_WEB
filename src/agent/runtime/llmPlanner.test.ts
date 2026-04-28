import { afterEach, describe, expect, it, vi } from 'vitest'
import { planWithLlm } from './llmPlanner'
import type { AgentContext } from '../types'

const baseContext: AgentContext = {
  state: 'MODE_SELECT',
  mobilityPaused: false,
  listType: '쇼핑리스트',
  shoppingList: [],
  pendingConfirmation: null,
  lastToolResult: null,
}

function makeFetch(bodyText: string, ok = true): typeof fetch {
  return vi.fn(async () => {
    return {
      ok,
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: bodyText }] }],
      }),
    } as Response
  }) as unknown as typeof fetch
}

describe('planWithLlm', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when api key is missing', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', '')
    const result = await planWithLlm(
      { text: '추천해줘', source: 'chat', context: baseContext, history: [] },
      makeFetch('{}'),
    )
    expect(result).toBeNull()
  })

  it('parses valid planner payload', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const result = await planWithLlm(
      { text: '추천해줘', source: 'chat', context: baseContext, history: [] },
      makeFetch('{"intentType":"request_recommendation","toolCall":{"name":"recommendationTool","args":{"mode":"taste"}},"confidence":0.88,"needsConfirmation":false}'),
    )
    expect(result?.intentType).toBe('request_recommendation')
    expect(result?.toolCall?.name).toBe('recommendationTool')
    expect(result?.toolCall?.args).toEqual({ mode: 'taste' })
  })

  it('maps known alias tool name to registered name', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const result = await planWithLlm(
      { text: '추천해줘', source: 'chat', context: baseContext, history: [] },
      makeFetch('{"intentType":"request_recommendation","toolCall":{"name":"recommendBooks","args":{"mode":"taste"}},"confidence":0.88,"needsConfirmation":false}'),
    )
    expect(result?.toolCall?.name).toBe('recommendationTool')
    expect(result?.toolCall?.args).toEqual({ mode: 'taste' })
  })

  it('drops unregistered tool name from planner payload', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const result = await planWithLlm(
      { text: '추천해줘', source: 'chat', context: baseContext, history: [] },
      makeFetch('{"intentType":"request_recommendation","toolCall":{"name":"nonExistingTool","args":{"mode":"taste"}},"confidence":0.88,"needsConfirmation":false}'),
    )
    expect(result?.intentType).toBe('request_recommendation')
    expect(result?.toolCall).toBeNull()
  })

  it('returns null on invalid json text', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const result = await planWithLlm(
      { text: '추천해줘', source: 'chat', context: baseContext, history: [] },
      makeFetch('not-json'),
    )
    expect(result).toBeNull()
  })
})

