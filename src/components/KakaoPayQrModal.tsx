import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { KakaoPaySession } from '../lib/payment/kakaoPay'
import { formatKrw, KAKAO_PAY_AUTO_COMPLETE_MS } from '../lib/payment/kakaoPay'

type KakaoPayQrModalProps = {
  session: KakaoPaySession
  busy: boolean
  onPaymentComplete: () => void
  onCancel: () => void
}

export function KakaoPayQrModal({ session, busy, onPaymentComplete, onCancel }: KakaoPayQrModalProps) {
  const completedRef = useRef(false)
  const onPaymentCompleteRef = useRef(onPaymentComplete)

  useEffect(() => {
    onPaymentCompleteRef.current = onPaymentComplete
  }, [onPaymentComplete])

  useEffect(() => {
    completedRef.current = false
    const timer = window.setTimeout(() => {
      if (completedRef.current) return
      completedRef.current = true
      onPaymentCompleteRef.current()
    }, KAKAO_PAY_AUTO_COMPLETE_MS)

    return () => window.clearTimeout(timer)
  }, [session.orderId])

  return createPortal(
    <div className="kakaoPayOverlay" role="dialog" aria-label="카카오페이 결제 QR" aria-modal="true">
      <div className="kakaoPayOverlayCard">
        <div className="kakaoPayOverlayHead">
          <span className="kakaoPayBrand">카카오페이</span>
          <strong>{session.itemCount}권 · {formatKrw(session.amountKrw)}</strong>
        </div>

        <section className="kakaoPayLineItems" aria-label="구매 목록">
          <h3 className="kakaoPayLineItemsTitle">구매 목록</h3>
          <ul className="kakaoPayLineItemsList">
            {session.lineItems.map((line) => (
              <li key={line.booksId} className="kakaoPayLineItem">
                <span className="kakaoPayLineItemTitle" title={line.title}>
                  {line.title}
                </span>
                <span className="kakaoPayLineItemPrice">{formatKrw(line.priceKrw)}</span>
              </li>
            ))}
          </ul>
          <div className="kakaoPayLineItemsTotal">
            <span>합계</span>
            <strong>{formatKrw(session.amountKrw)}</strong>
          </div>
        </section>

        <p className="kakaoPayOverlayHint">
          휴대폰 카메라로 QR을 스캔하면 카카오페이 결제·송금 화면이 열려요.
        </p>
        <div className="kakaoPayOverlayQr" aria-hidden>
          <QRCodeSVG
            value={session.qrPayload}
            size={220}
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#191919"
          />
        </div>
        <div className="kakaoPayOverlayActions">
          <button type="button" className="kakaoPayCancelButton" disabled={busy} onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
