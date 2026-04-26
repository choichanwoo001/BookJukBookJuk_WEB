import { describe, expect, it } from 'vitest'
import { requiresConfirmation } from './policy'
import type { AgentIntent } from './types'

function intent(type: AgentIntent['type'], confidence = 0.9): AgentIntent {
  return { type, source: 'chat', rawText: '', confidence, timestamp: Date.now() }
}

describe('requiresConfirmation', () => {
  it('returns false for cancel and confirm', () => {
    expect(requiresConfirmation(intent('cancel'))).toBe(false)
    expect(requiresConfirmation(intent('confirm'))).toBe(false)
  })

  it('requires confirmation for destructive intents', () => {
    expect(requiresConfirmation(intent('remove_book'))).toBe(true)
  })

  it('requires confirmation for low confidence', () => {
    expect(requiresConfirmation(intent('add_book', 0.5))).toBe(true)
  })
})
