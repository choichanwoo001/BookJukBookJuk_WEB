import type { AgentContext, AgentIntentSource, AgentMessage, ToolCall } from '../types'
import { readLlmEnv } from './llmEnv'

export type LlmPlan = {
  intentType: string
  toolCall: ToolCall | null
  assistantDraft?: string
  confidence: number
  needsConfirmation: boolean
}

export type LlmPlannerInput = {
  text: string
  source: AgentIntentSource
  context: AgentContext
  history: AgentMessage[]
}

type PlannerEnvelope = {
  intentType?: unknown
  toolCall?: unknown
  assistantDraft?: unknown
  confidence?: unknown
  needsConfirmation?: unknown
}

type Fetcher = typeof fetch

const ALLOWED_TOOL_NAMES = new Set([
  'bookSearchTool',
  'shoppingListTool',
  'routePlannerTool',
  'mobilityControlTool',
  'recommendationTool',
  'goalCheckTool',
  'fallbackTool',
])

const TOOL_NAME_ALIASES: Record<string, string> = {
  recommendBooks: 'recommendationTool',
}

const SYSTEM_PROMPT =
  '너는 도서관 쇼핑리스트 에이전트 planner다. 반드시 JSON만 출력한다. toolCall은 허용 도구명만 사용한다.'

function toHistoryText(history: AgentMessage[]): string {
  return history
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
}

function clamp01(input: unknown, fallback = 0.5): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return fallback
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function normalizeToolName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const aliased = TOOL_NAME_ALIASES[trimmed] ?? trimmed
  if (!ALLOWED_TOOL_NAMES.has(aliased)) return null
  return aliased
}

function parsePlanPayload(raw: unknown): LlmPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as PlannerEnvelope
  const intentType = typeof obj.intentType === 'string' ? obj.intentType : 'unknown'
  const assistantDraft = typeof obj.assistantDraft === 'string' ? obj.assistantDraft : undefined
  const needsConfirmation = Boolean(obj.needsConfirmation)
  const confidence = clamp01(obj.confidence, 0.6)

  let toolCall: ToolCall | null = null
  if (obj.toolCall && typeof obj.toolCall === 'object' && !Array.isArray(obj.toolCall)) {
    const call = obj.toolCall as { name?: unknown; args?: unknown }
    if (typeof call.name === 'string') {
      const normalizedName = normalizeToolName(call.name)
      if (normalizedName) {
        toolCall = {
          name: normalizedName,
          args: call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? (call.args as Record<string, unknown>) : {},
        }
      }
    }
  }

  return { intentType, toolCall, assistantDraft, confidence, needsConfirmation }
}

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

export async function planWithLlm(
  input: LlmPlannerInput,
  fetcher: Fetcher = fetch,
): Promise<LlmPlan | null> {
  const env = readLlmEnv()
  if (!env) return null

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
            content: [
              {
                type: 'input_text',
                text:
                  `${SYSTEM_PROMPT}\n` +
                  '허용 toolCall.name: bookSearchTool, shoppingListTool, routePlannerTool, mobilityControlTool, recommendationTool, goalCheckTool, fallbackTool.\n' +
                  '별칭 금지(예: recommendBooks 금지).\n' +
                  'JSON schema: {"intentType":"string","toolCall":{"name":"string","args":{}}|null,"assistantDraft":"string","confidence":0..1,"needsConfirmation":boolean}',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  userText: input.text,
                  source: input.source,
                  context: {
                    state: input.context.state,
                    listType: input.context.listType,
                    mobilityPaused: input.context.mobilityPaused,
                    pendingConfirmation: input.context.pendingConfirmation
                      ? {
                          toolName: input.context.pendingConfirmation.toolName,
                          summary: input.context.pendingConfirmation.summary,
                        }
                      : null,
                  },
                  history: toHistoryText(input.history),
                }),
              },
            ],
          },
        ],
        temperature: 0.2,
      }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as unknown
    const text = extractResponseText(payload).trim()
    if (!text) return null
    const parsed = JSON.parse(text) as unknown
    return parsePlanPayload(parsed)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

