import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ConfirmationCard } from './ConfirmationCard'
import { KakaoPayQrModal } from './KakaoPayQrModal'
import { ShelfRegisterQrModal } from './ShelfRegisterQrModal'
import { VoiceStatusIndicator } from './VoiceStatusIndicator'
import type { VoiceCommandPhase } from '../hooks/useVoiceCommandLoop'
import { mapListTypeToShelfType } from '../lib/supabase/shelves'
import type { AgentContext, AgentMessage } from '../agent/types'

function ChatPanel({
  activePane,
  onActivateChat,
  messages,
  submitUserText,
  context,
  busy,
  lastFailedUserText,
  acceptConfirmation,
  cancelConfirmation,
  retryLastFailed,
  listLoadStatus,
  listLoadMessage,
  ttsSpeaking,
  voicePhase,
  voiceLivePreview,
  voiceSupported,
  voicePermissionDenied,
  voiceArmRemainingMs,
  voiceMicOn,
  onToggleVoiceMic,
  onStartKakaoPayCheckout,
  onConfirmKakaoPayCheckout,
  onCancelKakaoPayCheckout,
}: {
  activePane: 'map' | 'chat'
  onActivateChat: () => void
  messages: AgentMessage[]
  submitUserText: (text: string) => Promise<void>
  context: AgentContext
  busy: boolean
  lastFailedUserText: string | null
  acceptConfirmation: () => void
  cancelConfirmation: () => void
  retryLastFailed: () => void
  listLoadStatus: 'idle' | 'loading' | 'ok' | 'error'
  listLoadMessage: string | null
  ttsSpeaking: boolean
  voicePhase: VoiceCommandPhase
  voiceLivePreview: string
  voiceSupported: boolean
  voicePermissionDenied: boolean
  voiceArmRemainingMs: number | null
  voiceMicOn: boolean
  onToggleVoiceMic: () => void
  onStartKakaoPayCheckout: () => void
  onConfirmKakaoPayCheckout: () => void
  onCancelKakaoPayCheckout: () => void
}) {
  const [draft, setDraft] = useState('')
  const [shelfRegisterQrOpen, setShelfRegisterQrOpen] = useState(false)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const lastReceiptIdRef = useRef<string | null>(null)

  useEffect(() => {
    const receiptId = context.receipt?.receiptId ?? null
    if (!receiptId || receiptId === lastReceiptIdRef.current) return
    lastReceiptIdRef.current = receiptId
    setShelfRegisterQrOpen(true)
  }, [context.receipt])

  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [draft, busy])
  const shelfKind = mapListTypeToShelfType(context.listType)
  const cartItems = context.cartItems.length > 0 ? context.cartItems : context.shoppingList

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim() || busy) return
    await submitUserText(draft)
    setDraft('')
  }

  useEffect(() => {
    const listEl = messageListRef.current
    if (!listEl) return
    listEl.scrollTop = listEl.scrollHeight
  }, [messages])

  return (
    <div
      className="chatPanelWrap"
      data-active-pane={activePane === 'chat'}
      onPointerDown={onActivateChat}
      onFocusCapture={onActivateChat}
    >
      <div className="chatPanel">
        <section className="chatShelfList" aria-label="오늘의 장바구니">
          <div className="chatShelfListHead">
            <span className="chatShelfListTitle">오늘의 장바구니</span>
            <span className="chatShelfListMeta">
              {shelfKind}
              {context.listType !== shelfKind ? ` · 표시: ${context.listType}` : ''} · {cartItems.length}권
            </span>
            <div className="chatShelfListActions">
              {context.receipt && (
                <button
                  type="button"
                  className="chatReceiptTrigger"
                  aria-label="앱 책장 등록 QR 보기"
                  aria-expanded={shelfRegisterQrOpen}
                  onClick={() => setShelfRegisterQrOpen(true)}
                >
                  책장 등록 QR
                </button>
              )}
              <button
                type="button"
                className="chatShelfLoadButton"
                onClick={() => void onStartKakaoPayCheckout()}
                disabled={busy || cartItems.length === 0 || context.kakaoPaySession !== null}
              >
                계산하기
              </button>
            </div>
          </div>
          {listLoadStatus === 'loading' ? (
            <p className="chatShelfListEmpty chatShelfListLoading">리스트를 불러오는 중이에요.</p>
          ) : listLoadStatus === 'error' ? (
            <p className="chatShelfListEmpty chatShelfListError">
              {listLoadMessage ?? '리스트를 불러오지 못했어요.'}
            </p>
          ) : cartItems.length === 0 ? (
            <p className="chatShelfListEmpty">
              저장된 책이 아직 없어요.
            </p>
          ) : (
            <ul className="chatShelfListItems">
              {cartItems.map((book) => (
                <li key={book.booksId} className="chatShelfListItem" title={book.booksId}>
                  <div className="chatShelfBookThumbWrap" aria-hidden>
                    {book.coverImageUrl ? (
                      <img className="chatShelfBookThumb" src={book.coverImageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="chatShelfBookThumb chatShelfBookThumbPlaceholder">NO IMAGE</div>
                    )}
                  </div>
                  <div className="chatShelfBookText">
                    <p className="chatShelfBookTitle">{book.title}</p>
                    <p className="chatShelfBookAuthor">{book.authors?.trim() || '작가 정보 없음'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {context.kakaoPaySession && (
          <KakaoPayQrModal
            session={context.kakaoPaySession}
            busy={busy}
            onPaymentComplete={() => void onConfirmKakaoPayCheckout()}
            onCancel={onCancelKakaoPayCheckout}
          />
        )}

        {context.receipt && shelfRegisterQrOpen && (
          <ShelfRegisterQrModal
            receipt={context.receipt}
            onClose={() => setShelfRegisterQrOpen(false)}
          />
        )}

        {context.pendingConfirmation && (
          <ConfirmationCard
            pending={context.pendingConfirmation}
            onConfirm={acceptConfirmation}
            onCancel={cancelConfirmation}
          />
        )}

        <div ref={messageListRef} className="chatMessages">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`chatBubble breakAnywhere ${
                message.role === 'recognition'
                  ? 'recognition'
                  : message.role === 'user'
                    ? 'user'
                    : 'assistant'
              }`}
              data-recognition-kind={message.recognitionKind}
            >
              <div>{message.text}</div>
              {message.attachments && message.attachments.length > 0 && (
                <ul className="chatBubbleAttachments">
                  {message.attachments.map((line, index) => (
                    <li key={`${message.id}-a-${index}`}>{line}</li>
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
                다시 시도
              </button>
            </div>
          </div>
        )}

        <div className="chatVoiceBar">
          <div className="chatVoiceBarControls">
            {voiceSupported && (
              <button
                type="button"
                className="chatMicButton"
                data-listening={voiceMicOn || undefined}
                disabled={busy || voicePermissionDenied}
                onClick={onToggleVoiceMic}
                aria-pressed={voiceMicOn}
                aria-label={voiceMicOn ? '마이크 끄기' : '마이크 켜기'}
              >
                <svg
                  className="chatMicIcon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                    fill="currentColor"
                  />
                  <path
                    d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z"
                    fill="currentColor"
                  />
                </svg>
                <span className="chatMicButtonLabel">{voiceMicOn ? '듣는 중' : '마이크'}</span>
              </button>
            )}
            <VoiceStatusIndicator
              phase={voicePhase}
              livePreview={voiceLivePreview}
              isSupported={voiceSupported}
              permissionDenied={voicePermissionDenied}
              busy={busy}
              ttsSpeaking={ttsSpeaking}
              armRemainingMs={voiceArmRemainingMs}
              isMicOn={voiceMicOn}
            />
            {ttsSpeaking && (
              <span className="chatTtsSpeaking" aria-live="polite">
                읽는 중
              </span>
            )}
          </div>
        </div>

        <form className="chatForm" onSubmit={handleSubmit}>
          <div className="chatFormInputRow">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  const form = event.currentTarget.form
                  if (form) form.requestSubmit()
                }
              }}
              placeholder="메시지를 입력하세요"
              aria-label="메시지 입력"
              disabled={busy}
              rows={1}
            />
            <button type="submit" disabled={!canSend}>
              전송
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChatPanel
