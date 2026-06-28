import type { ToolResult } from '../types'
import { callOpenAiResponses } from './llmClient'

type Fetcher = typeof fetch

const REWRITER_SYSTEM_PROMPT =
  '너는 도우미 문장 리라이터다. 한국어로 1~2문장만 작성하고, 제공된 사실만 사용한다.'

export async function rewriteAssistantMessage(
  result: ToolResult,
  attachments: string[] | undefined,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const res = await callOpenAiResponses(
    {
      system: REWRITER_SYSTEM_PROMPT,
      user: JSON.stringify({
        originalMessage: result.message,
        ok: result.ok,
        toolName: result.toolName,
        attachments: attachments ?? [],
      }),
      temperature: 0.4,
    },
    fetcher,
  )
  return res.ok ? res.text : null
}
