import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_MAP_EVENT_VERSION,
  dispatchMapCommand,
  dispatchPauseMobility,
  dispatchSetDirectGoals,
  dispatchStartNavigation,
  resetStickyMapCommandsForTest,
  subscribeMapCommand,
} from '../agent/runtime/agentEventBus'
import { extendedFixtureRobotDirectGoals, serendipityOnlyDirectGoals } from '../data/fixtureRobotRoute'

describe('transit serendipity detour event sequence', () => {
  afterEach(() => {
    resetStickyMapCommandsForTest()
  })

  it('emits serendipity goals then start navigation on detour begin', () => {
    const events: string[] = []
    const unsub = subscribeMapCommand((command) => {
      events.push(command.type)
    })

    const serendipityGoals = serendipityOnlyDirectGoals()
    dispatchSetDirectGoals(serendipityGoals)
    dispatchStartNavigation()

    expect(events).toContain('SET_DIRECT_GOALS')
    expect(events).toContain('START_NAVIGATION')
    expect(serendipityGoals).toHaveLength(1)

    unsub()
  })

  it('emits extended goals and resume on route accept', () => {
    const events: string[] = []
    const unsub = subscribeMapCommand((command) => {
      events.push(command.type)
    })

    const extendedGoals = extendedFixtureRobotDirectGoals()
    dispatchSetDirectGoals(extendedGoals)
    dispatchMapCommand({ type: 'RESUME_MOBILITY', version: AGENT_MAP_EVENT_VERSION })

    expect(events).toEqual(['SET_DIRECT_GOALS', 'RESUME_MOBILITY'])
    expect(extendedGoals).toHaveLength(2)

    unsub()
  })

  it('records pause during leg1 transit before detour', () => {
    const events: string[] = []
    const unsub = subscribeMapCommand((command) => {
      events.push(command.type)
    })

    dispatchPauseMobility()
    expect(events).toEqual(['PAUSE_MOBILITY'])

    unsub()
  })
})
