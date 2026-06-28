import type { AgentContext, AgentIntentSource, AgentMessage, ToolCall } from '../types'
import { callOpenAiResponsesJson } from './llmClient'

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
  'fallbackTool',
])

const TOOL_NAME_ALIASES: Record<string, string> = {
  recommendBooks: 'recommendationTool',
}

const SYSTEM_PROMPT =
  '너는 도서관 쇼핑리스트 에이전트 planner다. 반드시 JSON만 출력한다. toolCall은 허용 도구명만 사용한다.\n' +
  '쇼핑리스트 편집: 제목/표현 뒤에 "삭제해줘","제거해줘","빼줘","리스트에서 삭제" 등이 있으면 intentType은 remove_book, toolCall은 shoppingListTool(action remove).\n' +
  '"책 추가","추가해줘","담아줘","넣어줘" 등으로 특정 책을 리스트에 넣으려 하면 intentType은 add_book, toolCall은 shoppingListTool(action add).\n' +
  '위 패턴이 명확하면 추천·검색보다 리스트 편집 intent를 우선한다.\n' +
  '기분·컨디션·우울 등 "지금 기분에 맞는 책" 요청도 추천 요청이면 intentType은 request_recommendation, recommendationTool은 취향(taste) 기반이 맞다. assistantDraft에 취향 프로필·행동 로그를 기반으로 골랐다는 뉘앙스를 짧게 넣는다(별도 DB "기분 모드"는 없다).\n' +
  '도구 실행 없이 독서·서점·이용법 관련 대화 질문이면 intentType은 unknown, toolCall은 null, assistantDraft에 1~3문장 답변을 작성한다.\n' +
  '책·서점과 전혀 무관한 잡담(날씨·주식·요리 등)이면 intentType은 unknown, toolCall은 null, assistantDraft는 비운다.'

const PLANNER_SYSTEM_PROMPT =
  `${SYSTEM_PROMPT}\n` +
  '허용 toolCall.name: bookSearchTool, shoppingListTool, routePlannerTool, mobilityControlTool, recommendationTool, fallbackTool.\n' +
  '별칭 금지(예: recommendBooks 금지).\n' +
  'recommendationTool args.mode: taste(기본·취향), location(가까운/근처/동선/위치), rating(평점·인기·베스트). 사용자 표현에 맞게 선택.\n' +
  'JSON schema: {"intentType":"string","toolCall":{"name":"string","args":{}}|null,"assistantDraft":"string","confidence":0..1,"needsConfirmation":boolean}'

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

export async function planWithLlm(
  input: LlmPlannerInput,
  fetcher: Fetcher = fetch,
): Promise<LlmPlan | null> {
  const res = await callOpenAiResponsesJson<PlannerEnvelope>(
    {
      system: PLANNER_SYSTEM_PROMPT,
      user: JSON.stringify({
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
      temperature: 0.2,
      timeoutReserveMs: 0,
    },
    fetcher,
  )
  if (!res.ok) return null
  return parsePlanPayload(res.data)
}
