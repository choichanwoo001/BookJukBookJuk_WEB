/** Strip command-like prefixes from chat text so title hints work for catalog / visible list matching. */

const politeSuffixRe = /\s*(?:해줘|해주세요|해\s*줘|해\s*주세요|해주라|해주세용|부탁(?:해|해요)?|좀|plz|please)\s*$/iu
const trailingActionRe = /\s*(?:추가|담아|넣어|넣어줘|제거|삭제|빼|빼줘)\s*(?:해줘|해주세요|해|해요|해라|해주라|해주세용)?\s*$/iu
const fillerTokenRe = /(?:^|\s)(?:이거|그거|저거|좀|제발|please|plz)(?=\s|$)/giu

function normalizeCommon(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/[!?.,~]/g, ' ')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(fillerTokenRe, ' ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}

function stripPoliteTail(raw: string): string {
  let s = raw.trim()
  let prev = ''
  while (s && s !== prev) {
    prev = s
    s = s.replace(politeSuffixRe, '').trim()
    s = s.replace(trailingActionRe, '').trim()
  }
  return s
}

export function normalizeListHint(raw: string, role: 'add' | 'remove'): string {
  let s = normalizeCommon(raw)
  if (!s) return ''

  if (role === 'add') {
    s = s.replace(/^책\s*추가\s*/u, '')
    s = s.replace(/^책추가\s*/u, '')
    s = s.replace(/^책\s*(?:담아|넣어)\s*/u, '')
    s = s.replace(/^(?:추가해|담아|담아줘|넣어|넣어줘)\s*/u, '')
    s = s.replace(/^(?:리스트에|쇼핑리스트에)\s*/u, '')
    s = s.replace(/^추가\s+/u, '')
  } else {
    s = s.replace(/^책\s*(?:제거|삭제|빼)\s*/u, '')
    s = s.replace(/^책삭제\s*/u, '')
    s = s.replace(/^(?:삭제해|빼줘|제거해|제거)\s*/u, '')
    s = s.replace(/^(?:리스트에서|쇼핑리스트에서)\s*/u, '')
    s = s.replace(/^삭제\s+/u, '')
  }

  s = stripPoliteTail(s)
  return s.trim()
}

/** Avoid reverse match when the title is too short (likely noise inside a long hint). */
const MIN_TITLE_LEN_FOR_HINT_CONTAINS_TITLE = 3

export function matchShoppingListByTitleHint(
  shoppingList: { booksId: string; title: string }[],
  hint: string,
): { booksId: string; title: string }[] {
  const h = hint.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!h) return []
  return shoppingList.filter((b) => {
    const t = b.title.toLowerCase().replace(/\s+/g, ' ')
    if (t.includes(h)) return true
    if (t.length >= MIN_TITLE_LEN_FOR_HINT_CONTAINS_TITLE && h.includes(t)) return true
    return false
  })
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/**
 * When substring match fails (e.g. small title typos), pick a unique closest list title by edit distance.
 */
function compactForTitleDistance(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

export function findBestFuzzyShoppingListMatch(
  shoppingList: { booksId: string; title: string }[],
  hint: string,
): { booksId: string; title: string } | null {
  const h = hint.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!h || shoppingList.length === 0) return null

  const hCompact = compactForTitleDistance(h)
  const scored = shoppingList.map((item) => {
    const tCompact = compactForTitleDistance(item.title)
    return { item, dist: levenshtein(hCompact, tCompact) }
  })
  scored.sort((a, b) => a.dist - b.dist || a.item.title.localeCompare(b.item.title))
  const best = scored[0]!
  const second = scored[1]
  const maxLen = Math.max(
    hCompact.length,
    compactForTitleDistance(best.item.title).length,
    1,
  )
  const maxAllowedDist = Math.max(1, Math.min(8, Math.floor(0.28 * maxLen)))
  if (best.dist > maxAllowedDist) return null
  if (second && second.dist - best.dist < 2) return null
  return best.item
}

export function shoppingListSkipRecognition(): boolean {
  return import.meta.env.VITE_SHOPPING_LIST_SKIP_RECOGNITION === 'true'
}

