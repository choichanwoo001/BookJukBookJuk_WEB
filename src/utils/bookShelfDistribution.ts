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

/**
 * 결정론적 분배: 같은 책장에 놓인 책 id 목록(정렬됨)을 단(levels)에 라운드로빈.
 * `shelf_level`은 1부터 levelCount까지 (1 = 최하단).
 */
export function assignLevelsRoundRobin(
  bookIdsSorted: readonly string[],
  levelCount: number,
): Map<string, number> {
  const out = new Map<string, number>()
  const n = levelCount
  if (n < 1) throw new Error('assignLevelsRoundRobin: levelCount must be >= 1')
  if (n > 20) throw new Error('assignLevelsRoundRobin: levelCount must be <= 20')
  for (let i = 0; i < bookIdsSorted.length; i++) {
    out.set(bookIdsSorted[i], (i % n) + 1)
  }
  return out
}
