import { afterEach, describe, expect, it, vi } from 'vitest'
import { rewriteAssistantMessage } from './llmRewriter'
import type { ToolResult } from '../types'

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

const sampleResult: ToolResult = {
  ok: true,
  toolName: 'recommendationTool',
  message: '취향 기반 추천을 찾았어요.',
}

describe('rewriteAssistantMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when api key is missing', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', '')
    const rewritten = await rewriteAssistantMessage(sampleResult, ['1. 데미안 - 헤르만 헤세'], makeFetch('ok'))
    expect(rewritten).toBeNull()
  })

  it('returns rewritten text on success', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const rewritten = await rewriteAssistantMessage(
      sampleResult,
      ['1. 데미안 - 헤르만 헤세'],
      makeFetch('요청하신 취향 기준으로 추천을 정리했어요.'),
    )
    expect(rewritten).toBe('요청하신 취향 기준으로 추천을 정리했어요.')
  })

  it('returns null when response body is empty', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const rewritten = await rewriteAssistantMessage(sampleResult, undefined, makeFetch(''))
    expect(rewritten).toBeNull()
  })
})

