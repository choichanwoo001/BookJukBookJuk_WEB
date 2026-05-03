/**
 * Avoid showing nearly identical follow-up bubbles: the tool already returns a user-facing
 * line, then fallbackTool often repeats the same guidance (e.g. HTTP/bridge errors, ambiguous title).
 */
export function isRedundantFallbackAssistantText(primary: string, fallbackMsg: string): boolean {
  const p = primary.replace(/\s+/g, ' ').trim()
  const s = fallbackMsg.replace(/\s+/g, ' ').trim()
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

  return false
}
