import type { ToolResult } from '../types'
import { readLlmEnv } from './llmEnv'

type Fetcher = typeof fetch

function extractResponseText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const output = (json as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  const first = output[0]
  if (!first || typeof first !== 'object') return ''
  const content = (first as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const textItem = content.find((item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'output_text')
  if (!textItem || typeof textItem !== 'object') return ''
  return String((textItem as { text?: unknown }).text ?? '')
}

export async function rewriteAssistantMessage(
  result: ToolResult,
  attachments: string[] | undefined,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const env = readLlmEnv()
  if (!env) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, env.timeoutMs - 1000))
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
            content: [
              {
                type: 'input_text',
                text: '너는 도우미 문장 리라이터다. 한국어로 1~2문장만 작성하고, 제공된 사실만 사용한다.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  originalMessage: result.message,
                  ok: result.ok,
                  toolName: result.toolName,
                  attachments: attachments ?? [],
                }),
              },
            ],
          },
        ],
        temperature: 0.4,
      }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as unknown
    const rewritten = extractResponseText(payload).trim()
    if (!rewritten) return null
    return rewritten
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

