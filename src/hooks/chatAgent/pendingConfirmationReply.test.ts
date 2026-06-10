import { describe, expect, it } from 'vitest'
import { resolvePendingConfirmationReply } from './pendingConfirmationReply'

describe('resolvePendingConfirmationReply', () => {
  it('treats proceed tokens as confirm', () => {
    expect(resolvePendingConfirmationReply('오케이')).toBe('confirm')
    expect(resolvePendingConfirmationReply('okay')).toBe('confirm')
    expect(resolvePendingConfirmationReply('맞아')).toBe('confirm')
  })

  it('treats bare cancel phrases as cancel', () => {
    expect(resolvePendingConfirmationReply('취소')).toBe('cancel')
    expect(resolvePendingConfirmationReply('cancel')).toBe('cancel')
  })

  it('treats UI-style confirm words as confirm', () => {
    expect(resolvePendingConfirmationReply('확인')).toBe('confirm')
    expect(resolvePendingConfirmationReply('네')).toBe('confirm')
  })

  it('does not classify longer unrelated messages', () => {
    expect(resolvePendingConfirmationReply('데미안 추가해줘')).toBeNull()
    expect(resolvePendingConfirmationReply('')).toBeNull()
  })
})
