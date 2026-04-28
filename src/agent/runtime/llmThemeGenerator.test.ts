import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateThemesWithLlm } from './llmThemeGenerator'

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

describe('generateThemesWithLlm', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns env_missing when api key is absent', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', '')
    const res = await generateThemesWithLlm(
      { q1: '퇴근 후 피곤해요', q2: '마음이 정리됐으면 좋겠어요' },
      makeFetch('{}'),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('env_missing')
  })

  it('parses and normalizes valid payload', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const res = await generateThemesWithLlm(
      { q1: '요즘 지쳐요', q2: '가볍게 읽고 싶어요' },
      makeFetch(
        JSON.stringify({
          themes: [
            {
              id: 'Theme Reflective 1',
              name: '감정 정리 에세이',
              description: '하루를 마무리하며 가볍게 읽고 감정을 정리하는 테마',
              reason: '사용자가 피로와 감정 정리를 원함',
              keywords: ['감정', '정리', '퇴근'],
            },
            {
              id: 'theme_light_psychology',
              name: '가벼운 심리 인사이트',
              description: '관계와 기분 패턴을 부담 없이 이해하는 테마',
              reason: '일상 감정 패턴에 대한 이해를 원함',
              keywords: ['심리', '일상', '관계'],
            },
            {
              id: 'theme_comfort_fiction',
              name: '잔잔한 위로 소설',
              description: '몰입은 되지만 긴장이 낮은 서사를 읽는 테마',
              reason: '스트레스 완화와 안정감을 원함',
              keywords: ['위로', '몰입', '안정'],
            },
          ],
          confidence: 0.88,
        }),
      ),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.themes).toHaveLength(3)
    expect(res.themes[0].id).toBe('theme_reflective_1')
    expect(res.confidence).toBe(0.88)
  })

  it('returns parse_error on invalid json body', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const res = await generateThemesWithLlm(
      { q1: '집중 안 돼요', q2: '동기 회복이 필요해요' },
      makeFetch('not-json'),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('parse_error')
  })

  it('returns schema_error when themes are insufficient', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
    const res = await generateThemesWithLlm(
      { q1: '집중 안 돼요', q2: '동기 회복이 필요해요' },
      makeFetch(
        JSON.stringify({
          themes: [
            {
              id: 'theme_one',
              name: '동기 회복',
              description: '짧은 성장 사례',
              reason: '동기 필요',
              keywords: ['동기', '성장'],
            },
          ],
          confidence: 0.7,
        }),
      ),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('schema_error')
  })
})
