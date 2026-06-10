/**
 * Avoid showing nearly identical follow-up bubbles: the tool already returns a user-facing
 * line, then fallbackTool often repeats the same guidance (e.g. HTTP/bridge errors, ambiguous title).
 */

/** High enough to catch paraphrases that share most tokens; tuned via assistantMessageDedupe.test.ts */
const JACCARD_REDUNDANT_THRESHOLD = 0.6

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Strip leading/trailing punctuation so "없습니다." and "없습니다" match as tokens. */
function cleanToken(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim()
}

function tokenizeForDedupe(s: string): string[] {
  const n = normalizeWhitespace(s)
  if (!n) return []
  return n
    .split(/\s+/)
    .map((t) => cleanToken(t))
    .filter((t) => t.length > 0)
}

function tokenSetJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const x of a) {
    if (b.has(x)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** True if `small` is a strict subset of `large` (by token set) and has at least two tokens. */
function isStrictTokenSubset(small: Set<string>, large: Set<string>): boolean {
  if (small.size < 2 || small.size >= large.size) return false
  for (const t of small) {
    if (!large.has(t)) return false
  }
  return true
}

export function isRedundantFallbackAssistantText(primary: string, fallbackMsg: string): boolean {
  const p = normalizeWhitespace(primary)
  const s = normalizeWhitespace(fallbackMsg)
  if (!p || !s) return false
  if (p === s) return true

  const tryAgain = '지금은 확인이 어려워요'
  const tryAgain2 = '잠시 후 다시 시도'
  if ((p.includes(tryAgain) || p.includes(tryAgain2)) && (s.includes(tryAgain) || s.includes(tryAgain2))) {
    return true
  }

  const ambiguous =
    (p.includes('모호') || p.includes('여러 책') || p.includes('비슷해요')) &&
    (s.includes('모호') || s.includes('여러 책') || s.includes('비슷해요'))
  if (ambiguous) return true

  const tokensP = tokenizeForDedupe(p)
  const tokensS = tokenizeForDedupe(s)
  const setP = new Set(tokensP)
  const setS = new Set(tokensS)
  if (setP.size === 0 || setS.size === 0) return false

  if (tokenSetJaccard(setP, setS) >= JACCARD_REDUNDANT_THRESHOLD) {
    return true
  }

  if (isStrictTokenSubset(setP, setS) || isStrictTokenSubset(setS, setP)) {
    return true
  }

  return false
}
