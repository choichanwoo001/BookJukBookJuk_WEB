const WAKE_TEXT_SKIP_RE = /[\s,.!?…·'"“"]/

export function normalizeWakeText(text: string): string {
  return text.replace(/[\s,.!?…·'"“"]+/g, '').toLowerCase()
}

function isWakeTextSkipChar(ch: string): boolean {
  return WAKE_TEXT_SKIP_RE.test(ch)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function sortWakeWordsByLength(wakeWords: readonly string[]): string[] {
  return [...wakeWords].sort((a, b) => b.length - a.length)
}

export type WakeWordMatch = {
  word: string
  index: number
}

/** Finds the earliest wake-word occurrence (longer words checked first at same index). */
export function findWakeWordMatch(text: string, wakeWords: readonly string[]): WakeWordMatch | null {
  const haystack = normalizeWakeText(text)
  let best: WakeWordMatch | null = null

  for (const word of sortWakeWordsByLength(wakeWords)) {
    const needle = normalizeWakeText(word)
    const index = haystack.indexOf(needle)
    if (index < 0) continue
    if (!best || index < best.index || (index === best.index && word.length > best.word.length)) {
      best = { word, index }
    }
  }

  return best
}

export function containsWakeWord(text: string, wakeWords: readonly string[]): boolean {
  return findWakeWordMatch(text, wakeWords) !== null
}

/** Removes the first wake-word match and trims leftover punctuation/spaces. */
export function stripWakeWord(text: string, wakeWords: readonly string[]): string {
  const match = findWakeWordMatch(text, wakeWords)
  if (!match) return text.trim()

  const normWord = normalizeWakeText(match.word)
  let normIdx = 0
  let i = 0

  while (i < text.length && normIdx < match.index) {
    if (!isWakeTextSkipChar(text[i])) normIdx += 1
    i += 1
  }

  let normConsumed = 0
  while (i < text.length && normConsumed < normWord.length) {
    const ch = text[i]
    if (isWakeTextSkipChar(ch)) {
      i += 1
      continue
    }
    if (ch.toLowerCase() !== normWord[normConsumed]) break
    normConsumed += 1
    i += 1
  }

  if (normConsumed < normWord.length) {
    const re = new RegExp(escapeRegExp(match.word), 'i')
    return text.replace(re, '').replace(/^[\s,.!?…·]+/, '').trim()
  }

  return text.slice(i).replace(/^[\s,.!?…·]+/, '').trim()
}

export function extractCommandFromTranscript(
  transcript: string,
  wakeWords: readonly string[],
  alreadyArmed: boolean,
): { armed: boolean; command: string } {
  const trimmed = transcript.trim()
  if (!trimmed) {
    return { armed: alreadyArmed, command: '' }
  }

  const match = findWakeWordMatch(trimmed, wakeWords)
  if (match) {
    return { armed: true, command: stripWakeWord(trimmed, wakeWords) }
  }

  if (alreadyArmed) {
    return { armed: true, command: trimmed }
  }

  return { armed: false, command: '' }
}
