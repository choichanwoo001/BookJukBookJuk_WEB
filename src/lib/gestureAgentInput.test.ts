import { describe, expect, it } from 'vitest'
import { gestureToAgentInput } from './gestureAgentInput'

describe('gestureToAgentInput', () => {
  it('maps ok_sign to proceed token', () => {
    expect(gestureToAgentInput('ok_sign')).toBe('오케이')
  })

  it('maps stop to pause mobility token', () => {
    expect(gestureToAgentInput('stop')).toBe('정지')
  })

  it('returns null for book capture gestures', () => {
    expect(gestureToAgentInput('thumbs_up')).toBeNull()
    expect(gestureToAgentInput('thumbs_down')).toBeNull()
  })
})
