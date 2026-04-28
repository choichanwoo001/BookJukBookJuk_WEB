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

export function matchShoppingListByTitleHint(
  shoppingList: { booksId: string; title: string }[],
  hint: string,
): { booksId: string; title: string }[] {
  const h = hint.trim().toLowerCase()
  if (!h) return []
  return shoppingList.filter((b) => b.title.toLowerCase().includes(h))
}

export function shoppingListSkipRecognition(): boolean {
  return import.meta.env.VITE_SHOPPING_LIST_SKIP_RECOGNITION === 'true'
}
