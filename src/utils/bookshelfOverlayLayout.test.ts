import { describe, expect, it } from 'vitest'
import { bookshelfOverlayLayerInstances } from '../data/bookshelfOverlayLayer'
import {
  computeIslandLayout,
  computeWallLayout,
  isWallAttachedShelf,
  MIN_BOOKSHELF_DETAIL_D,
  MIN_BOOKSHELF_DETAIL_W,
  shelfOpenSignTowardCorridor,
} from './bookshelfOverlayLayout'

describe('bookshelf overlay layout', () => {
  it('creates deterministic island layouts', () => {
    const a = computeIslandLayout(1.25, -2.5, 1.2, 1.6, 0.7, 1.552)
    const b = computeIslandLayout(1.25, -2.5, 1.2, 1.6, 0.7, 1.552)

    expect(b).toEqual(a)
    expect(a.mode).toBe('island')
    expect(a.books.length).toBeGreaterThan(0)
    expect(a.partitionsX.length).toBeGreaterThan(0)
  })

  it('creates deterministic wall layouts', () => {
    const a = computeWallLayout(0.5, 0.75, 1.4, 1.8, 0.45, 1.352, 1.752)
    const b = computeWallLayout(0.5, 0.75, 1.4, 1.8, 0.45, 1.352, 1.752)

    expect(b).toEqual(a)
    expect(a.mode).toBe('wall')
    expect(a.books.length).toBeGreaterThan(0)
    expect(a.partitions.length).toBeGreaterThan(0)
  })

  it('detects wall-facing shelves that need a Z mirror', () => {
    const wrongFacing = bookshelfOverlayLayerInstances.filter(
      (inst) =>
        inst.w >= MIN_BOOKSHELF_DETAIL_W &&
        inst.d >= MIN_BOOKSHELF_DETAIL_D &&
        isWallAttachedShelf(inst.cx, inst.cz, inst.d) &&
        shelfOpenSignTowardCorridor(inst.cx, inst.cz, inst.yaw) === -1,
    )

    expect(wrongFacing.length).toBeGreaterThan(0)
  })

  it('keeps corridor-facing shelves unchanged', () => {
    const corridorFacing = bookshelfOverlayLayerInstances.filter(
      (inst) =>
        inst.w >= MIN_BOOKSHELF_DETAIL_W &&
        inst.d >= MIN_BOOKSHELF_DETAIL_D &&
        isWallAttachedShelf(inst.cx, inst.cz, inst.d) &&
        shelfOpenSignTowardCorridor(inst.cx, inst.cz, inst.yaw) === 1,
    )

    expect(corridorFacing.length).toBeGreaterThan(0)
  })

  it('classifies every detailed wall-attached overlay shelf as facing toward or away from the corridor', () => {
    const detailed = bookshelfOverlayLayerInstances.filter(
      (inst) =>
        inst.w >= MIN_BOOKSHELF_DETAIL_W &&
        inst.d >= MIN_BOOKSHELF_DETAIL_D &&
        isWallAttachedShelf(inst.cx, inst.cz, inst.d),
    )

    expect(detailed.length).toBeGreaterThan(0)
    for (const inst of detailed) {
      expect([-1, 1]).toContain(shelfOpenSignTowardCorridor(inst.cx, inst.cz, inst.yaw))
    }
  })
})
