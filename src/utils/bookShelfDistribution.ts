/**
 * 결정론적 분배: 같은 섹터의 책 id 목록(정렬됨)을 해당 섹터 책장 id 목록에 라운드로빈.
 * 예: 50권·5책장 → 책장당 10권; 50권·4책장 → 13,13,12,12.
 */
export function assignBooksToShelvesRoundRobin(
  bookIdsSorted: readonly string[],
  shelfIdsSorted: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>()
  const n = shelfIdsSorted.length
  if (n === 0) throw new Error('assignBooksToShelvesRoundRobin: shelfIdsSorted is empty')
  for (let i = 0; i < bookIdsSorted.length; i++) {
    out.set(bookIdsSorted[i], shelfIdsSorted[i % n])
  }
  return out
}
