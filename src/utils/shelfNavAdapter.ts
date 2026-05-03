import type { FixtureRenderInstance } from '../types/scene'

/** missionIndices로 변환: 인스턴스 배열 순서와 Map3DView `instances`와 동일해야 함. */
export function missionIndicesFromShelfIds(
  shelfIds: string[],
  bookshelfInstances: FixtureRenderInstance[],
): number[] {
  const out: number[] = []
  for (const id of shelfIds) {
    const idx = bookshelfInstances.findIndex(
      (inst) => inst.kind === 'bookshelf' && inst.shelfId === id,
    )
    if (idx >= 0) out.push(idx)
  }
  return out
}
