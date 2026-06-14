import type { AgentIntent, AgentIntentSource, AgentIntentType } from './types'

type Rule = {
  type: AgentIntentType
  keywords?: string[]
  /** Case-insensitive match on normalized text */
  regex?: RegExp
  priority: number
  confidence: number
}

const rules: Rule[] = [
  { type: 'checkout', keywords: ['계산', '계산하러', '계산대', '결제', '구매 완료', '큐레이션 종료', '종료하고 계산'], priority: 120, confidence: 0.95 },
  { type: 'add_book', regex: /(사기|살래|살게|구매|카트|장바구니|담아|넣어)/, priority: 89, confidence: 0.9 },
  {
    type: 'cancel',
    keywords: ['취소', '됐어', '그만', 'cancel', 'no thanks'],
    priority: 110,
    confidence: 0.94,
  },
  {
    type: 'cancel',
    regex: /아니\s*,?\s*(취소|그만|됐어)/,
    priority: 109,
    confidence: 0.93,
  },
  { type: 'cancel', regex: /^\s*(no|nope)\s*$/i, priority: 109, confidence: 0.92 },
  { type: 'confirm', keywords: ['오케이', 'okay', 'ok', '맞아', '찬성'], priority: 108, confidence: 0.93 },
  { type: 'resume_mobility', regex: /^\s*\/\s*(?:로봇\s*)?진행(?:해)?\s*$/i, priority: 107, confidence: 0.94 },
  { type: 'confirm', regex: /^\s*\/\s*(?:로봇\s*)?확정(?:해)?\s*$/i, priority: 107, confidence: 0.94 },
  { type: 'pause_mobility', keywords: ['멈춰', '정지', 'stop'], priority: 100, confidence: 0.95 },
  { type: 'resume_mobility', keywords: ['진행해', '재개', 'go'], priority: 99, confidence: 0.95 },
  { type: 'follow_robot', keywords: ['따라와', '따라와줘', 'follow me', 'follow'], priority: 98, confidence: 0.94 },
  { type: 'lead_robot', keywords: ['다시 리드', '안내 재개', '리드해', 'lead again'], priority: 97, confidence: 0.94 },
  { type: 'add_book', regex: /책\s*(추가|담아|넣어)/, priority: 88, confidence: 0.9 },
  { type: 'add_book', keywords: ['책 추가', '추가해', '담아'], priority: 87, confidence: 0.88 },
  { type: 'remove_book', regex: /책\s*(제거|삭제|빼)/, priority: 88, confidence: 0.9 },
  { type: 'remove_book', regex: /.+\s*(리스트에서|목록에서)?\s*(삭제|제거|빼줘|빼)\s*해?줘?/, priority: 88, confidence: 0.9 },
  { type: 'remove_book', keywords: ['책 제거', '삭제해', '빼줘'], priority: 87, confidence: 0.88 },
  { type: 'route_replan_shortest', keywords: ['최단경로', '경로 바꿔', '재계산'], priority: 86, confidence: 0.84 },
  { type: 'search_books', keywords: ['책 검색', '제목 검색', '검색해줘', '찾아봐'], priority: 73, confidence: 0.82 },
  { type: 'request_recommendation', keywords: ['추천', '추천해', '찾아줘'], priority: 75, confidence: 0.82 },
  { type: 'request_recommendation', keywords: ['검색', '탐색', '둘러볼'], priority: 68, confidence: 0.74 },
  { type: 'select_browse_mode', keywords: ['계획 없어', '계획 없음'], priority: 68, confidence: 0.74 },
]

function listTypeFromText(text: string): string | undefined {
  if (/읽는\s*중|읽는중/.test(text)) return '읽는중'
  if (/읽은/.test(text)) return '읽은'
  if (/평가한/.test(text)) return '평가한'
  if (/쇼핑\s*리스트|쇼핑리스트/.test(text)) return '쇼핑리스트'
  return undefined
}

function quantityFromText(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:권|개)(?:\s*으로)?/)
  if (m) return Number.parseInt(m[1], 10)
  const m2 = text.match(/(?:수량|개수)\s*[:：]?\s*(\d+)/)
  if (m2) return Number.parseInt(m2[1], 10)
  return undefined
}

function searchQueryFromText(text: string): string | undefined {
  const normalized = text
    .replace(/(책|도서)\s*검색/gi, ' ')
    .replace(/제목\s*검색/gi, ' ')
    .replace(/검색해줘|찾아봐|찾아줘|추천해줘/gi, ' ')
    .replace(/해줘|해 봐|해봐/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length >= 2) return normalized
  return undefined
}

function ruleMatches(rule: Rule, normalized: string): boolean {
  if (rule.regex?.test(normalized)) return true
  if (rule.keywords?.some((k) => normalized.includes(k.toLowerCase()))) return true
  return false
}

export function parseIntent(text: string, source: AgentIntentSource = 'chat'): AgentIntent {
  const trimmed = text.trim()
  const normalized = trimmed.toLowerCase()
  const now = Date.now()

  let best: Rule | null = null
  for (const rule of rules) {
    if (!ruleMatches(rule, normalized)) continue
    if (!best || rule.priority > best.priority) best = rule
  }

  const payload: Record<string, string | number | boolean> = {}
  const qty = quantityFromText(trimmed)
  if (qty !== undefined) payload.quantity = qty
  const lt = listTypeFromText(trimmed)
  if (lt) payload.listType = lt
  const query = searchQueryFromText(trimmed)
  if (query) payload.query = query

  if (best) {
    return {
      type: best.type,
      source,
      rawText: text,
      confidence: best.confidence,
      timestamp: now,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    }
  }

  return {
    type: 'unknown',
    source,
    rawText: text,
    confidence: 0.4,
    timestamp: now,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  }
}
