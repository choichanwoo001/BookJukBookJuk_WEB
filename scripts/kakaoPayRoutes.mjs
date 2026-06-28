import { readBody, sendJson, setCors } from './identifyProxyCore.mjs'
import {
  approveKakaoPayOrder,
  createKakaoPayReadySession,
  getOrderStatus,
  isKakaoPayConfigured,
  markOrderCancelled,
  markOrderFailed,
  renderPaymentResultHtml,
} from './kakaoPayApiCore.mjs'

function sendHtml(res, status, html) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

function readQuery(req) {
  return new URL(req.url ?? '/', 'http://localhost')
}

/** @param {import('http').IncomingMessage} req */
function getApprovalHost(req) {
  const host = req.headers.host?.trim()
  return host || undefined
}

export function registerKakaoPayRoutes(serverMiddleware) {
  serverMiddleware.use(async (req, res, next) => {
    const url = readQuery(req)
    const pathname = url.pathname
    if (!pathname.startsWith('/kakao-pay')) {
      next()
      return
    }

    setCors(res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    try {
      if (req.method === 'GET' && pathname === '/kakao-pay/health') {
        sendJson(res, 200, { ok: true, configured: isKakaoPayConfigured() })
        return
      }

      if (req.method === 'POST' && pathname === '/kakao-pay/ready') {
        const raw = await readBody(req)
        const body = JSON.parse(raw || '{}')
        const result = await createKakaoPayReadySession(body, getApprovalHost(req))
        sendJson(res, result.ok ? 200 : 502, result)
        return
      }

      const statusMatch = pathname.match(/^\/kakao-pay\/status\/([^/]+)$/)
      if (req.method === 'GET' && statusMatch) {
        const orderId = decodeURIComponent(statusMatch[1])
        const status = getOrderStatus(orderId)
        if (!status) {
          sendJson(res, 404, { ok: false, errorCode: 'ORDER_NOT_FOUND', message: '결제 주문을 찾을 수 없어요.' })
          return
        }
        sendJson(res, 200, { ok: true, data: status })
        return
      }

      if (req.method === 'GET' && pathname === '/kakao-pay/approve') {
        const orderId = url.searchParams.get('order_id')?.trim() ?? ''
        const pgToken = url.searchParams.get('pg_token')?.trim() ?? ''
        if (!orderId || !pgToken) {
          sendHtml(res, 400, renderPaymentResultHtml('결제 오류', '결제 승인 정보가 없어요.'))
          return
        }
        const result = await approveKakaoPayOrder(orderId, pgToken)
        if (!result.ok) {
          sendHtml(res, 502, renderPaymentResultHtml('결제 실패', result.message ?? '결제 승인에 실패했어요.'))
          return
        }
        sendHtml(
          res,
          200,
          renderPaymentResultHtml('결제 완료', '카카오페이 결제가 완료됐어요. 서점 화면으로 돌아가 주세요.'),
        )
        return
      }

      if (req.method === 'GET' && pathname === '/kakao-pay/cancel') {
        const orderId = url.searchParams.get('order_id')?.trim() ?? ''
        if (orderId) markOrderCancelled(orderId)
        sendHtml(res, 200, renderPaymentResultHtml('결제 취소', '결제가 취소됐어요.'))
        return
      }

      if (req.method === 'GET' && pathname === '/kakao-pay/fail') {
        const orderId = url.searchParams.get('order_id')?.trim() ?? ''
        if (orderId) markOrderFailed(orderId)
        sendHtml(res, 502, renderPaymentResultHtml('결제 실패', '결제에 실패했어요. 다시 시도해 주세요.'))
        return
      }

      sendJson(res, 404, { ok: false, message: 'not found', errorCode: 'NOT_FOUND' })
    } catch (error) {
      console.error('[kakao-pay] error', error)
      sendJson(res, 500, {
        ok: false,
        message: error instanceof Error ? error.message : 'server error',
        errorCode: 'SERVER_ERROR',
      })
    }
  })
}
