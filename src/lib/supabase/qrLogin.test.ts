import { describe, expect, it } from 'vitest'
import { extractQrTokenFromDeepLink } from './qrLogin'

describe('extractQrTokenFromDeepLink', () => {
  it('returns token from valid deep link', () => {
    const token = extractQrTokenFromDeepLink('bookjuk://qr-login?token=abc123')
    expect(token).toBe('abc123')
  })

  it('returns empty for invalid input', () => {
    expect(extractQrTokenFromDeepLink('')).toBe('')
    expect(extractQrTokenFromDeepLink('not-a-url')).toBe('')
    expect(extractQrTokenFromDeepLink('bookjuk://qr-login')).toBe('')
  })
})
