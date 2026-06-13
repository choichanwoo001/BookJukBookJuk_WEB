import { describe, expect, it } from 'vitest'
import { DEMO_BOOKS } from '../data/demoScenario'
import { buildDemoScenarioRoute } from './demoScenarioRoute'
import { buildRouteMasterPath } from './pathSampling'

describe('buildDemoScenarioRoute', () => {
  it('defines six stops from entrance through checkout', () => {
    const route = buildDemoScenarioRoute()
    expect(route.stops).toHaveLength(6)
    expect(route.stops[0].kind).toBe('spawn')
    expect(route.stops[route.stops.length - 1].kind).toBe('checkout')
  }, 30_000)

  it('uses distributed pool indices for demo books', () => {
    const route = buildDemoScenarioRoute()
    expect(route.poolIndices).toEqual([
      DEMO_BOOKS.book1.poolIndex,
      DEMO_BOOKS.serendipity.poolIndex,
      DEMO_BOOKS.book2.poolIndex,
      DEMO_BOOKS.alternative.poolIndex,
    ])
    expect(DEMO_BOOKS.book1.poolIndex).toBe(27)
    expect(DEMO_BOOKS.serendipity.poolIndex).toBe(13)
    expect(DEMO_BOOKS.book2.poolIndex).toBe(9)
    expect(DEMO_BOOKS.alternative.poolIndex).toBe(6)
  }, 30_000)

  it('connects all legs with walkable paths', () => {
    const route = buildDemoScenarioRoute()
    expect(route.segments).toHaveLength(5)
    const broken = route.segments.filter((s) => !s.connected)
    expect(broken, broken.map((s) => `${s.fromLabel}->${s.toLabel}`).join(', ')).toEqual([])
    expect(route.coveragePercent).toBeGreaterThan(0)
  }, 30_000)

  it('builds a master path long enough for 3D overview preview', () => {
    const route = buildDemoScenarioRoute()
    const masterPath = buildRouteMasterPath(route)
    expect(masterPath.length).toBeGreaterThanOrEqual(2)
  }, 30_000)
})
