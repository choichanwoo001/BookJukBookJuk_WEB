import { describe, expect, it } from 'vitest'
import { computeIslandLayout, computeWallLayout } from './bookshelfOverlayLayout'

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
})
