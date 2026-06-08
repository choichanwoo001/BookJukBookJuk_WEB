import { readLlmEnv } from './llmEnv'

export type LlmFailureReason = 'env_missing' | 'http_error' | 'timeout' | 'empty_response' | 'parse_error'

export type LlmCallResult =
  | { ok: true; text: string }
  | { ok: false; reason: LlmFailureReason }

type Fetcher = typeof fetch

export type OpenAiResponsesInput = {
  system: string
  user: string
  temperature?: number
  /** Reserve ms for caller work; default subtracts 1000ms from env timeout */
  timeoutReserveMs?: number
}

export function extractOpenAiResponseText(json: unknown): string {
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

export async function callOpenAiResponses(
  input: OpenAiResponsesInput,
  fetcher: Fetcher = fetch,
): Promise<LlmCallResult> {
  const env = readLlmEnv()
  if (!env) return { ok: false, reason: 'env_missing' }

  const reserve = input.timeoutReserveMs ?? 1000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, env.timeoutMs - reserve))
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
            content: [{ type: 'input_text', text: input.system }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: input.user }],
          },
        ],
        temperature: input.temperature ?? 0.4,
      }),
    })
    if (!response.ok) return { ok: false, reason: 'http_error' }
    const payload = (await response.json()) as unknown
    const text = extractOpenAiResponseText(payload).trim()
    if (!text) return { ok: false, reason: 'empty_response' }
    return { ok: true, text }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: 'http_error' }
  } finally {
    clearTimeout(timeout)
  }
}

export function llmFailureUserMessage(reason: LlmFailureReason): string {
  if (reason === 'env_missing') {
    return 'OpenAI API 키가 설정되지 않았어요. .env.local에 VITE_OPENAI_API_KEY를 넣어 주세요.'
  }
  return '잠시 AI 연결에 문제가 있어요. 잠시 후 다시 말씀해 주세요.'
}

export async function callOpenAiResponsesJson<T>(
  input: OpenAiResponsesInput,
  fetcher: Fetcher = fetch,
): Promise<{ ok: true; data: T } | { ok: false; reason: LlmFailureReason }> {
  const res = await callOpenAiResponses({ ...input, system: `${input.system}\n반드시 JSON만 출력한다.` }, fetcher)
  if (!res.ok) return res
  try {
    const parsed = JSON.parse(res.text) as T
    return { ok: true, data: parsed }
  } catch {
    return { ok: false, reason: 'parse_error' }
  }
}
