import type { CartItem } from '../../agent/types'

export type KakaoPayLineItem = CartItem & { priceKrw: number }

export type KakaoPayPaymentStatus = 'pending' | 'paid' | 'cancelled' | 'failed'

export type KakaoPaySession = {
  orderId: string
  amountKrw: number
  itemCount: number
  qrPayload: string
  lineItems: KakaoPayLineItem[]
  itemName: string
  status: KakaoPayPaymentStatus
  createdAt: string
}

const DEFAULT_BOOK_PRICE_KRW = 15_000

/** 시연용: QR 표시 후 자동 구매 완료까지 대기(ms). */
export const KAKAO_PAY_AUTO_COMPLETE_MS = 3000

export function getDemoBookPriceKrw(): number {
  const raw = import.meta.env.VITE_KAKAO_PAY_DEMO_BOOK_PRICE_KRW?.trim() ?? ''
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BOOK_PRICE_KRW
  return parsed
}

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

export function buildKakaoPayLineItems(cartItems: CartItem[]): KakaoPayLineItem[] {
  const unitPrice = getDemoBookPriceKrw()
  return cartItems
    .filter((item) => item.booksId.trim().length > 0)
    .map((item) => ({ ...item, priceKrw: unitPrice }))
}

export function summarizeKakaoPayItemName(lineItems: KakaoPayLineItem[]): string {
  if (lineItems.length === 0) return '북죽 서점 도서'
  if (lineItems.length === 1) return lineItems[0].title
  return `${lineItems[0].title} 외 ${lineItems.length - 1}권`
}
