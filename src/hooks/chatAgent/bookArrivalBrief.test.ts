import { describe, expect, it } from 'vitest'
import { DEMO_BOOKS } from '../../data/demoScenario'
import { buildBookArrivalBriefItems } from './bookArrivalBrief'

describe('buildBookArrivalBriefItems', () => {
  it('builds synopsis, review, and author brief items', () => {
    const items = buildBookArrivalBriefItems(DEMO_BOOKS.book2, 0)
    expect(items).toHaveLength(3)
    expect(items[0].text).toContain('오직 두 사람')
    expect(items[0].gate).toEqual({ kind: 'on_shelf_arrived', leg: 0 })
    expect(items[1].text).toBe(DEMO_BOOKS.book2.reviewBrief)
    expect(items[2].text).toBe(DEMO_BOOKS.book2.authorBioBrief)
  })
})
