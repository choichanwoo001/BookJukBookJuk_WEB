import { useEffect, useMemo, useState } from 'react'
import { getDefaultUserId } from '../lib/supabase/env'
import {
  consumeApprovedTicketAndIssueWebSession,
  createQrLoginTicket,
  getCurrentWebSessionUsersId,
  getQrLoginTicketSnapshot,
} from '../lib/supabase/qrLogin'

type QrLoginGateProps = {
  onLoggedIn: (usersId: string) => void
}

function formatRemainMs(expiresAt: number): string {
  const diff = Math.max(0, expiresAt - Date.now())
  return `${Math.ceil(diff / 1000)}초`
}

export default function QrLoginGate({ onLoggedIn }: QrLoginGateProps) {
  const [ticketToken, setTicketToken] = useState('')
  const [ticketExpiresAt, setTicketExpiresAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [simulatedUserId, setSimulatedUserId] = useState(getDefaultUserId())

  const deepLink = useMemo(() => {
    if (!ticketToken) return ''
    return `bookjuk://qr-login?token=${encodeURIComponent(ticketToken)}`
  }, [ticketToken])

  useEffect(() => {
    let disposed = false
    const bootstrap = async () => {
      const sessionRes = await getCurrentWebSessionUsersId()
      if (!disposed && sessionRes.ok && sessionRes.data) {
        onLoggedIn(sessionRes.data)
        return
      }

      const ticketRes = await createQrLoginTicket()
      if (disposed) return
      if (!ticketRes.ok) {
        setErrorMessage('QR 로그인 세션을 만들지 못했어요. Supabase 설정을 확인해 주세요.')
        setLoading(false)
        return
      }

      setTicketToken(ticketRes.data.token)
      setTicketExpiresAt(ticketRes.data.expiresAt)
      setErrorMessage(null)
      setLoading(false)
    }
    void bootstrap()
    return () => {
      disposed = true
    }
  }, [onLoggedIn])

  useEffect(() => {
    if (!ticketToken) return
    let disposed = false
    const poll = async () => {
      const snapshotRes = await getQrLoginTicketSnapshot(ticketToken)
      if (disposed || !snapshotRes.ok || !snapshotRes.data) return
      if (snapshotRes.data.status !== 'approved') return
      const consumeRes = await consumeApprovedTicketAndIssueWebSession({ token: ticketToken })
      if (disposed) return
      if (consumeRes.ok) {
        onLoggedIn(consumeRes.data.usersId)
      }
    }
    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 1500)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [onLoggedIn, ticketToken])

  const approveForDemo = async () => {
    setErrorMessage(null)
    onLoggedIn(simulatedUserId.trim() || getDefaultUserId())
  }

  const regenerateTicket = async () => {
    setLoading(true)
    const ticketRes = await createQrLoginTicket()
    if (!ticketRes.ok) {
      setErrorMessage('QR 세션을 다시 만들지 못했어요.')
      setLoading(false)
      return
    }
    setTicketToken(ticketRes.data.token)
    setTicketExpiresAt(ticketRes.data.expiresAt)
    setErrorMessage(null)
    setLoading(false)
  }

  return (
    <section className="qrLoginGate">
      <p className="onboardingEyebrow">Returning reader</p>
      <h1>QR로 다시 로그인</h1>
      <p>모바일 앱에서 QR 토큰을 승인하면 이전 독서 기록을 불러와요.</p>

      {loading ? (
        <p className="qrLoginHint">로그인 세션을 만드는 중이에요.</p>
      ) : (
        <>
          <div className="qrLoginTokenBox">
            <p className="qrLoginLabel">QR 토큰 내용</p>
            <code className="breakAnywhere">{deepLink || '세션 없음'}</code>
            {ticketExpiresAt && <p className="qrLoginHint">만료까지 {formatRemainMs(ticketExpiresAt)}</p>}
          </div>

          <div className="qrLoginDemoRow">
            <input
              value={simulatedUserId}
              onChange={(event) => setSimulatedUserId(event.target.value)}
              placeholder="승인할 users_id"
            />
            <button type="button" onClick={() => void approveForDemo()}>
              테스트 즉시 승인
            </button>
            <button type="button" onClick={() => void regenerateTicket()}>
              QR 재생성
            </button>
          </div>
        </>
      )}

      {errorMessage && <p className="qrLoginError">{errorMessage}</p>}
    </section>
  )
}
