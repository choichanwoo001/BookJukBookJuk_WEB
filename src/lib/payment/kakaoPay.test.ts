import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildKakaoPayLineItems, formatKrw, getDemoBookPriceKrw, summarizeKakaoPayItemName } from './kakaoPay'

const item = {
  booksId: 'book-1',
  title: '단 한 사람',
  authors: '최진영',
}

describe('kakaoPay', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses default book price when env is unset', () => {
    vi.stubEnv('VITE_KAKAO_PAY_DEMO_BOOK_PRICE_KRW', '')
    expect(getDemoBookPriceKrw()).toBe(15_000)
  })

  it('reads book price from env', () => {
    vi.stubEnv('VITE_KAKAO_PAY_DEMO_BOOK_PRICE_KRW', '12000')
    expect(getDemoBookPriceKrw()).toBe(12_000)
  })

  it('formats KRW amounts', () => {
    expect(formatKrw(45000)).toBe('45,000원')
  })

  it('builds line items with per-book price', () => {
    vi.stubEnv('VITE_KAKAO_PAY_DEMO_BOOK_PRICE_KRW', '15000')
    const lineItems = buildKakaoPayLineItems([item, { ...item, booksId: 'book-2', title: '오직 두 사람' }])
    expect(lineItems).toHaveLength(2)
    expect(lineItems[0].priceKrw).toBe(15_000)
    expect(lineItems[1].priceKrw).toBe(15_000)
  })

  it('summarizes item names for Kakao Pay', () => {
    const lineItems = buildKakaoPayLineItems([item, { ...item, booksId: 'book-2', title: '오직 두 사람' }])
    expect(summarizeKakaoPayItemName(lineItems)).toBe('단 한 사람 외 1권')
  })
})
