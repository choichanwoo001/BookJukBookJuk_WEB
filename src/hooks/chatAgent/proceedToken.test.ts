import { describe, expect, it } from 'vitest'
import { isProceedToken } from './proceedToken'

describe('isProceedToken', () => {
  it('accepts Korean proceed phrases', () => {
    expect(isProceedToken('진행해')).toBe(true)
    expect(isProceedToken('진행')).toBe(true)
    expect(isProceedToken('시작')).toBe(true)
    expect(isProceedToken('오케이')).toBe(true)
    expect(isProceedToken('확정할게')).toBe(true)
    expect(isProceedToken('start')).toBe(true)
  })

  it('accepts slash robot proceed commands', () => {
    expect(isProceedToken('/진행')).toBe(true)
    expect(isProceedToken('/로봇 진행')).toBe(true)
  })

  it('rejects unrelated text', () => {
    expect(isProceedToken('추천해줘')).toBe(false)
    expect(isProceedToken('')).toBe(false)
    expect(isProceedToken('   ')).toBe(false)
  })
})
