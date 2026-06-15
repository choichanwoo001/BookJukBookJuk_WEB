import type { KakaoPayLineItem, KakaoPayPaymentStatus, KakaoPaySession } from './kakaoPay'

const API_BASE = import.meta.env.VITE_KAKAO_PAY_API_BASE?.trim() || '/kakao-pay'

type ReadyResponse =
  | {
      ok: true
      data: KakaoPaySession
    }
  | {
      ok: false
      errorCode?: string
      message?: string
    }

type StatusResponse =
  | {
      ok: true
      data: { orderId: string; status: KakaoPayPaymentStatus; amountKrw: number; itemCount: number }
    }
  | {
      ok: false
      errorCode?: string
      message?: string
    }

export async function requestKakaoPayReady(params: {
  orderId: string
  partnerUserId: string
  amountKrw: number
  lineItems: KakaoPayLineItem[]
}): Promise<ReadyResponse> {
  try {
    const res = await fetch(`${API_BASE}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const payload = (await res.json()) as ReadyResponse
    return payload
  } catch (error) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : '카카오페이 서버에 연결하지 못했어요.',
    }
  }
}

export async function fetchKakaoPayStatus(orderId: string): Promise<StatusResponse> {
  try {
    const res = await fetch(`${API_BASE}/status/${encodeURIComponent(orderId)}`)
    return (await res.json()) as StatusResponse
  } catch (error) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : '결제 상태를 확인하지 못했어요.',
    }
  }
}

export async function createKakaoPaySession(params: {
  partnerUserId: string
  lineItems: KakaoPayLineItem[]
}): Promise<
  | { ok: true; session: KakaoPaySession }
  | { ok: false; errorCode?: string; message: string }
> {
  const lineItems = params.lineItems
  if (lineItems.length === 0) {
    return { ok: false, errorCode: 'CART_EMPTY', message: '구매할 책이 없어요.' }
  }

  const orderId = crypto.randomUUID()
  const amountKrw = lineItems.reduce((sum, line) => sum + line.priceKrw, 0)
  const ready = await requestKakaoPayReady({
    orderId,
    partnerUserId: params.partnerUserId,
    amountKrw,
    lineItems,
  })

  if (!ready.ok) {
    return {
      ok: false,
      errorCode: ready.errorCode,
      message: ready.message ?? '카카오페이 결제 준비에 실패했어요.',
    }
  }

  return { ok: true, session: ready.data }
}
