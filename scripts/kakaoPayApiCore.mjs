import {
  kakaoPayApiItemName,
  postKakaoPayJson,
  sanitizeKakaoPaySecretKey,
  summarizeItemNameDisplay,
} from './kakaoPayHttp.mjs'

const KAKAO_PAY_READY_URL = 'https://open-api.kakaopay.com/online/v1/payment/ready'
const KAKAO_PAY_APPROVE_URL = 'https://open-api.kakaopay.com/online/v1/payment/approve'

/** @type {Map<string, {
 *   orderId: string
 *   tid: string
 *   partnerUserId: string
 *   amountKrw: number
 *   itemCount: number
 *   itemName: string
 *   lineItems: unknown[]
 *   status: 'pending' | 'paid' | 'cancelled' | 'failed'
 *   createdAt: string
 * }>} */
const orders = new Map()

function getSecretKey() {
  return sanitizeKakaoPaySecretKey(process.env.KAKAO_PAY_SECRET_KEY)
}

function getCid() {
  return process.env.KAKAO_PAY_CID?.trim() || 'TC0ONETIME'
}

function isDemoFallbackEnabled() {
  const raw = process.env.KAKAO_PAY_DEMO_FALLBACK?.trim().toLowerCase()
  if (raw === 'false' || raw === '0') return false
  return true
}

function isKakaoDomainValidationError(payload) {
  const code = payload?.error_code ?? payload?.code
  const message = String(payload?.error_message ?? payload?.msg ?? '')
  return code === -400 && /도메인|domain/i.test(message)
}

function kakaoApiErrorMessage(payload, fallback) {
  return (
    payload?.error_message ??
    payload?.msg ??
    payload?.extras?.method_result_message ??
    fallback
  )
}

function buildDemoReadySession(params) {
  const { orderId, partnerUserId, amountKrw, lineItems, itemName } = params
  const demoTid = `demo-${orderId}`
  orders.set(orderId, {
    orderId,
    tid: demoTid,
    partnerUserId,
    amountKrw,
    itemCount: lineItems.length,
    itemName,
    lineItems,
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  return {
    ok: true,
    data: {
      orderId,
      tid: demoTid,
      amountKrw,
      itemCount: lineItems.length,
      qrPayload: `https://mockup-pg-web.kakao.com/v1/${orderId.replace(/-/g, '').slice(0, 12)}/mInfo`,
      lineItems,
      itemName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  }
}

function getApprovalBaseUrl(fallbackHost) {
  const configured = process.env.KAKAO_PAY_APPROVAL_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (fallbackHost) return `http://${fallbackHost}`
  return 'http://localhost:5173'
}

export function isKakaoPayConfigured() {
  return getSecretKey().length > 0
}

export function getOrderStatus(orderId) {
  const order = orders.get(orderId)
  if (!order) return null
  return {
    orderId: order.orderId,
    status: order.status,
    amountKrw: order.amountKrw,
    itemCount: order.itemCount,
  }
}

export async function createKakaoPayReadySession(body, approvalHost) {
  const secretKey = getSecretKey()
  if (!secretKey) {
    return {
      ok: false,
      errorCode: 'KAKAO_PAY_NOT_CONFIGURED',
      message: 'KAKAO_PAY_SECRET_KEY가 설정되지 않았어요. .env.local에 시크릿 키를 넣어 주세요.',
    }
  }

  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : []
  const amountKrw = Number(body.amountKrw)
  const partnerUserId = String(body.partnerUserId ?? 'guest').trim() || 'guest'
  const orderId = String(body.orderId ?? crypto.randomUUID()).trim() || crypto.randomUUID()

  if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
    return { ok: false, errorCode: 'INVALID_AMOUNT', message: '결제 금액이 올바르지 않아요.' }
  }
  if (lineItems.length === 0) {
    return { ok: false, errorCode: 'CART_EMPTY', message: '구매할 책이 없어요.' }
  }

  const approvalBaseUrl = getApprovalBaseUrl(approvalHost)
  const itemName = summarizeItemNameDisplay(lineItems)
  const apiItemName = kakaoPayApiItemName(lineItems)

  const { statusCode, json: payload } = await postKakaoPayJson(KAKAO_PAY_READY_URL, secretKey, {
    cid: getCid(),
    partner_order_id: orderId,
    partner_user_id: partnerUserId,
    item_name: apiItemName,
    quantity: 1,
    total_amount: amountKrw,
    tax_free_amount: 0,
    approval_url: `${approvalBaseUrl}/kakao-pay/approve?order_id=${encodeURIComponent(orderId)}`,
    cancel_url: `${approvalBaseUrl}/kakao-pay/cancel?order_id=${encodeURIComponent(orderId)}`,
    fail_url: `${approvalBaseUrl}/kakao-pay/fail?order_id=${encodeURIComponent(orderId)}`,
  })

  if (statusCode < 200 || statusCode >= 300) {
    const message = kakaoApiErrorMessage(payload, '카카오페이 결제 준비에 실패했어요.')
    if (isDemoFallbackEnabled() && isKakaoDomainValidationError(payload)) {
      console.warn('[kakao-pay] domain validation failed; using demo QR fallback:', message)
      return buildDemoReadySession({
        orderId,
        partnerUserId,
        amountKrw,
        lineItems,
        itemName,
      })
    }
    return { ok: false, errorCode: 'KAKAO_PAY_READY_FAILED', message }
  }

  const tid = payload.tid
  const qrPayload =
    payload.next_redirect_mobile_url ??
    payload.android_app_scheme ??
    payload.next_redirect_app_url ??
    payload.next_redirect_pc_url

  if (!tid || !qrPayload) {
    return { ok: false, errorCode: 'KAKAO_PAY_READY_INVALID', message: '카카오페이 응답에 결제 URL이 없어요.' }
  }

  orders.set(orderId, {
    orderId,
    tid,
    partnerUserId,
    amountKrw,
    itemCount: lineItems.length,
    itemName,
    lineItems,
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  return {
    ok: true,
    data: {
      orderId,
      tid,
      amountKrw,
      itemCount: lineItems.length,
      qrPayload,
      lineItems,
      itemName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  }
}

export async function approveKakaoPayOrder(orderId, pgToken) {
  const secretKey = getSecretKey()
  const order = orders.get(orderId)
  if (!order) {
    return { ok: false, errorCode: 'ORDER_NOT_FOUND', message: '결제 주문을 찾을 수 없어요.' }
  }
  if (order.status === 'paid') {
    return { ok: true, data: { orderId, status: 'paid' } }
  }

  const { statusCode, json: payload } = await postKakaoPayJson(KAKAO_PAY_APPROVE_URL, secretKey, {
    cid: getCid(),
    tid: order.tid,
    partner_order_id: orderId,
    partner_user_id: order.partnerUserId,
    pg_token: pgToken,
  })

  if (statusCode < 200 || statusCode >= 300) {
    order.status = 'failed'
    const message = kakaoApiErrorMessage(payload, '카카오페이 결제 승인에 실패했어요.')
    return { ok: false, errorCode: 'KAKAO_PAY_APPROVE_FAILED', message }
  }

  order.status = 'paid'
  return { ok: true, data: { orderId, status: 'paid', approvedAmount: payload.amount?.total ?? order.amountKrw } }
}

export function markOrderCancelled(orderId) {
  const order = orders.get(orderId)
  if (!order) return false
  if (order.status === 'pending') order.status = 'cancelled'
  return true
}

export function markOrderFailed(orderId) {
  const order = orders.get(orderId)
  if (!order) return false
  if (order.status === 'pending') order.status = 'failed'
  return true
}

export function renderPaymentResultHtml(title, message) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #fffef5; color: #191919; }
    main { text-align: center; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #444; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`
}
