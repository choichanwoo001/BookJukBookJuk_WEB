import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useChatAgent } from '../hooks/useChatAgent'
import { ConfirmationCard } from './ConfirmationCard'

function ChatPanel() {
  const [draft, setDraft] = useState('')
  const {
    messages,
    submitUserText,
    context,
    latestMapSnapshot,
    telemetry,
    busy,
    lastFailedUserText,
    acceptConfirmation,
    cancelConfirmation,
    retryLastFailed,
  } = useChatAgent()

  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [draft, busy])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || busy) {
      return
    }
    await submitUserText(trimmed)
    setDraft('')
  }

  const tel = telemetry as typeof telemetry & {
    intentStats?: Record<string, { success: number; failure: number }>
    bridgeErrorCounts?: Record<string, number>
    toolLatencyAvgMs?: Record<string, number>
  }

  return (
    <div className="chatPanelWrap">
      <div className="chatPanel">
        <header className="chatHeader">
          <h2>채팅</h2>
          <p>
            상태: {context.state}
            {context.mobilityPaused ? ' · 이동 정지' : ' · 이동 가능'}
          </p>
          {latestMapSnapshot && (
            <p>
              미션 v{latestMapSnapshot.missionVersion}
              {latestMapSnapshot.playerXz
                ? ` · 위치(${latestMapSnapshot.playerXz[0].toFixed(1)}, ${latestMapSnapshot.playerXz[1].toFixed(1)})`
                : ' · 위치 대기'}
              {latestMapSnapshot.version != null ? ` · bus v${latestMapSnapshot.version}` : ''}
            </p>
          )}
          <p>
            성공 {telemetry.toolSuccess} · 실패 {telemetry.toolFailure} · 재확인 {telemetry.reconfirmRequested} ·
            fallback {telemetry.fallbackUsed ?? 0}
          </p>
          {tel.toolLatencyAvgMs && Object.keys(tel.toolLatencyAvgMs).length > 0 && (
            <p className="chatLastToolBadge">
              평균 지연(ms):{' '}
              {Object.entries(tel.toolLatencyAvgMs)
                .map(([k, v]) => `${k}=${v.toFixed(0)}`)
                .join(', ')}
            </p>
          )}
          {tel.intentStats && Object.keys(tel.intentStats).length > 0 && (
            <p style={{ fontSize: '0.78rem', color: '#8fa6c4' }}>
              인텐트:{' '}
              {Object.entries(tel.intentStats)
                .map(([k, v]) => `${k}(${v.success}/${v.failure})`)
                .join(' · ')}
            </p>
          )}
        </header>

        {context.pendingConfirmation && (
          <ConfirmationCard
            pending={context.pendingConfirmation}
            onConfirm={acceptConfirmation}
            onCancel={cancelConfirmation}
          />
        )}

        {busy && (
          <div className="chatBusyRow" aria-live="polite">
            <span className="chatSpinner" aria-hidden />
            처리 중…
          </div>
        )}

        <div className="chatMessages">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`chatBubble ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div>{message.text}</div>
              {message.attachments && message.attachments.length > 0 && (
                <ul className="chatBubbleAttachments">
                  {message.attachments.map((line, i) => (
                    <li key={`${message.id}-a-${i}`}>{line}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        {lastFailedUserText && (
          <div className="chatBusyRow">
            <div className="chatRetryRow">
              <span>마지막 요청이 실패했어요.</span>
              <button type="button" onClick={() => retryLastFailed()}>
                재시도
              </button>
            </div>
          </div>
        )}

        <form className="chatForm" onSubmit={handleSubmit}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="메시지를 입력하세요"
            aria-label="메시지 입력"
            disabled={busy}
          />
          <button type="submit" disabled={!canSend}>
            전송
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChatPanel
