import { readLlmEnv } from './llmEnv'

export type LlmTheme = {
  id: string
  name: string
  description: string
  reason: string
  keywords: string[]
}

export type LlmThemeGenerationInput = {
  q1: string
  q2: string
  context?: {
    listType?: string
    state?: string
  }
}

export type LlmThemeGenerationSuccess = {
  ok: true
  themes: LlmTheme[]
  confidence: number
}

export type LlmThemeGenerationFailureReason =
  | 'env_missing'
  | 'http_error'
  | 'timeout'
  | 'empty_response'
  | 'parse_error'
  | 'schema_error'
  | 'unknown_error'

export type LlmThemeGenerationFailure = {
  ok: false
  reason: LlmThemeGenerationFailureReason
}

export type LlmThemeGenerationResult = LlmThemeGenerationSuccess | LlmThemeGenerationFailure

type Fetcher = typeof fetch

type ThemeEnvelope = {
  themes?: unknown
  confidence?: unknown
}

const SYSTEM_PROMPT = [
  '너는 도서 추천용 테마 생성기다.',
  '반드시 JSON만 출력한다.',
  '입력된 Q1/Q2 답변을 보고 테마 3개를 생성한다.',
  '스키마를 정확히 지켜라.',
  'JSON schema:',
  '{"themes":[{"id":"string","name":"string","description":"string","reason":"string","keywords":["string"]}],"confidence":0..1}',
  '규칙:',
  '- themes 길이는 정확히 3',
  '- name은 30자 이내, description/reason은 120자 이내',
  '- keywords는 2~5개, 중복 금지',
  '- id는 소문자, 숫자, 언더스코어만 사용',
].join('\n')

function clamp01(input: unknown, fallback = 0.5): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, maxLen)
}

function sanitizeId(input: unknown): string {
  const raw = sanitizeText(input, 50).toLowerCase()
  if (!raw) return ''
  const normalized = raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized
}

function sanitizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const dedup = new Set<string>()
  for (const item of input) {
    const kw = sanitizeText(item, 20)
    if (kw) dedup.add(kw)
    if (dedup.size >= 5) break
  }
  return Array.from(dedup)
}

function extractResponseText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const output = (json as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  const first = output[0]
  if (!first || typeof first !== 'object') return ''
  const content = (first as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const textItem = content.find(
    (item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'output_text',
  )
  if (!textItem || typeof textItem !== 'object') return ''
  return String((textItem as { text?: unknown }).text ?? '')
}

function parseThemes(payload: unknown): LlmThemeGenerationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'schema_error' }
  }
  const obj = payload as ThemeEnvelope
  if (!Array.isArray(obj.themes)) {
    return { ok: false, reason: 'schema_error' }
  }

  const normalized: LlmTheme[] = []
  const idSet = new Set<string>()
  const nameSet = new Set<string>()

  for (const item of obj.themes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const id = sanitizeId(row.id)
    const name = sanitizeText(row.name, 30)
    const description = sanitizeText(row.description, 120)
    const reason = sanitizeText(row.reason, 120)
    const keywords = sanitizeKeywords(row.keywords)

    if (!id || !name || !description || !reason) continue
    if (keywords.length < 2) continue
    const nameKey = name.toLowerCase()
    if (idSet.has(id) || nameSet.has(nameKey)) continue
    idSet.add(id)
    nameSet.add(nameKey)
    normalized.push({ id, name, description, reason, keywords })
    if (normalized.length >= 3) break
  }

  if (normalized.length !== 3) {
    return { ok: false, reason: 'schema_error' }
  }

  return {
    ok: true,
    themes: normalized,
    confidence: clamp01(obj.confidence, 0.6),
  }
}

export async function generateThemesWithLlm(
  input: LlmThemeGenerationInput,
  fetcher: Fetcher = fetch,
): Promise<LlmThemeGenerationResult> {
  const env = readLlmEnv()
  if (!env) return { ok: false, reason: 'env_missing' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.timeoutMs)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  q1: input.q1,
                  q2: input.q2,
                  context: input.context ?? null,
                }),
              },
            ],
          },
        ],
        temperature: 0.4,
      }),
    })
    if (!response.ok) return { ok: false, reason: 'http_error' }
    const payload = (await response.json()) as unknown
    const text = extractResponseText(payload).trim()
    if (!text) return { ok: false, reason: 'empty_response' }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'parse_error' }
    }
    return parseThemes(parsed)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: 'unknown_error' }
  } finally {
    clearTimeout(timeout)
  }
}
