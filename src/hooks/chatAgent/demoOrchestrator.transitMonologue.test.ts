import { describe, expect, it, vi } from 'vitest'
import {
  claimTransitMonologueLeg,
  initialDemoOrchestratorState,
  maybeAnnounceTransitMonologue,
} from './demoOrchestrator'

vi.mock('../../agent/runtime/llmTransitMonologue', () => ({
  generateTransitMonologue: vi.fn(async () => '이동 중 소개 문장'),
}))

import { generateTransitMonologue } from '../../agent/runtime/llmTransitMonologue'

describe('claimTransitMonologueLeg', () => {
  it('claims the first leg and updates transitLegAnnounced', () => {
    const state = initialDemoOrchestratorState()
    const result = claimTransitMonologueLeg(state, 0)

    expect(result.claimed).toBe(true)
    expect(result.nextState.transitLegAnnounced).toBe(0)
    expect(state.transitLegAnnounced).toBe(-1)
  })

  it('does not claim the same leg twice', () => {
    const state = { ...initialDemoOrchestratorState(), transitLegAnnounced: 0 }
    const result = claimTransitMonologueLeg(state, 0)

    expect(result.claimed).toBe(false)
    expect(result.nextState).toBe(state)
  })

  it('claims a new leg after the previous one was announced', () => {
    const state = { ...initialDemoOrchestratorState(), transitLegAnnounced: 0 }
    const result = claimTransitMonologueLeg(state, 1)

    expect(result.claimed).toBe(true)
    expect(result.nextState.transitLegAnnounced).toBe(1)
  })
})

describe('maybeAnnounceTransitMonologue', () => {
  it('returns null without calling LLM when leg is already announced', async () => {
    vi.mocked(generateTransitMonologue).mockClear()
    const state = { ...initialDemoOrchestratorState(), transitLegAnnounced: 0 }

    const result = await maybeAnnounceTransitMonologue({
      state,
      activeLeg: 0,
      title: '어른이 된다는 것',
      authors: '우치다 타츠루',
      demoStep: 'visiting_planned',
    })

    expect(result.message).toBeNull()
    expect(result.nextState).toBe(state)
    expect(generateTransitMonologue).not.toHaveBeenCalled()
  })

  it('claims before awaiting LLM and returns the message once', async () => {
    vi.mocked(generateTransitMonologue).mockClear()
    const state = initialDemoOrchestratorState()

    const result = await maybeAnnounceTransitMonologue({
      state,
      activeLeg: 0,
      title: '어른이 된다는 것',
      authors: '우치다 타츠루',
      demoStep: 'visiting_planned',
    })

    expect(result.message).toBe('이동 중 소개 문장')
    expect(result.nextState.transitLegAnnounced).toBe(0)
    expect(generateTransitMonologue).toHaveBeenCalledTimes(1)
  })
})
