import { describe, expect, it } from 'vitest'
import { isEnRoute, resolveNavigationMobilityPhase } from './navigationMobility'

describe('resolveNavigationMobilityPhase', () => {
  it('returns idle when demo navigation is inactive', () => {
    expect(
      resolveNavigationMobilityPhase({
        demoNavigationActive: false,
        demoAutoWalkActive: true,
        highlightPathLength: 10,
      }),
    ).toBe('idle')
  })

  it('progresses calculating → walking during demo navigation', () => {
    expect(
      resolveNavigationMobilityPhase({
        demoNavigationActive: true,
        demoAutoWalkActive: false,
        highlightPathLength: 0,
      }),
    ).toBe('calculating')

    expect(
      resolveNavigationMobilityPhase({
        demoNavigationActive: true,
        demoAutoWalkActive: true,
        highlightPathLength: 0,
      }),
    ).toBe('walking')

    expect(
      resolveNavigationMobilityPhase({
        demoNavigationActive: true,
        demoAutoWalkActive: true,
        highlightPathLength: 12,
      }),
    ).toBe('walking')
  })
})

describe('isEnRoute', () => {
  it('returns true when auto-walking', () => {
    expect(
      isEnRoute({
        isAutoWalking: true,
        isWalkMode: false,
        isManualWalking: false,
        distanceToGoalM: null,
      }),
    ).toBe(true)
  })

  it('returns true for manual WASD walk in walk mode with a goal distance', () => {
    expect(
      isEnRoute({
        isAutoWalking: false,
        isWalkMode: true,
        isManualWalking: true,
        distanceToGoalM: 12.5,
      }),
    ).toBe(true)
  })

  it('returns false when idle in walk mode', () => {
    expect(
      isEnRoute({
        isAutoWalking: false,
        isWalkMode: true,
        isManualWalking: false,
        distanceToGoalM: 8,
      }),
    ).toBe(false)
  })
})
