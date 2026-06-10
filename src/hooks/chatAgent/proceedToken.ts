export function isProceedToken(text: string): boolean {
  const raw = text.trim()
  if (!raw) return false

  const lower = raw.toLowerCase()
  const compact = lower.replace(/\s+/g, '')

  if (/^\/?(로봇)?진행/.test(compact)) return true
  if (/^\/?(로봇)?확정/.test(compact)) return true
  if (/^진행/.test(raw)) return true
  if (/^확정/.test(raw)) return true
  if (/^시작/.test(raw)) return true

  const short = ['오케이', 'okay', 'ok', 'start', '맞아', '확정할게', '시작']
  for (const token of short) {
    if (lower === token || lower.startsWith(`${token} `) || lower.startsWith(`${token}\n`)) {
      return true
    }
  }
  return false
}
