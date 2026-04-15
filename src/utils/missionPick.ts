/**
 * 책장 인덱스 목록에서 version 시드로 Fisher–Yates 셔플 후 최대 4개 선택 (결정론적, 렌더 순수).
 */
export function pickMissionIndicesSeeded(bookshelfIndices: number[], version: number): number[] {
  if (bookshelfIndices.length === 0) return []
  const arr = [...bookshelfIndices]
  let s = (version * 0x9e3779b9 + bookshelfIndices.length * 0x51eb) >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
  return arr.slice(0, Math.min(4, arr.length))
}
