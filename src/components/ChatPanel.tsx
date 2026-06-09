import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ChatActionCard } from './ChatActionCard'
import { ConfirmationCard } from './ConfirmationCard'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { useTts } from '../hooks/useTts'
import { mapListTypeToShelfType } from '../lib/supabase/shelves'
import type { AgentContext, AgentMessage, ChatActionCard as ChatActionCardModel } from '../agent/types'

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
  actionCard,
  onVoiceRecognized,
}: {
  activePane: 'map' | 'chat'
  onActivateChat: () => void
  messages: AgentMessage[]
  submitUserText: (text: string) => Promise<void>
  onVoiceRecognized?: (transcript: string) => void
  context: AgentContext
  busy: boolean
  lastFailedUserText: string | null
  acceptConfirmation: () => void
  cancelConfirmation: () => void
  retryLastFailed: () => void
  listLoadStatus: 'idle' | 'loading' | 'ok' | 'error'
  listLoadMessage: string | null
  actionCard: ChatActionCardModel | null
}) {
  const [draft, setDraft] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)

  const tts = useTts()

  const handleSpeechResult = useCallback((transcript: string) => {
    const trimmed = transcript.trim()
    if (!trimmed) return
    onVoiceRecognized?.(trimmed)
    setDraft((prev) => {
      const prevTrimmed = prev.trim()
      return prevTrimmed ? `${prevTrimmed} ${trimmed}` : trimmed
    })
  }, [onVoiceRecognized])

  const speech = useSpeechInput({ onResult: handleSpeechResult })
  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [draft, busy])
  const shelfKind = mapListTypeToShelfType(context.listType)
  const cartItems = context.cartItems.length > 0 ? context.cartItems : context.shoppingList

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim() || busy) return
    await submitUserText(draft)
    setDraft('')
  }

  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCountRef.current && last?.role === 'assistant') {
      void tts.speak(last.text)
    }
    prevMsgCountRef.current = messages.length
  }, [messages, tts])

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
            <button
              type="button"
              className="chatShelfLoadButton"
              onClick={() => void submitUserText('계산하러 가자')}
              disabled={busy || cartItems.length === 0 || context.checkoutStatus === 'going_to_counter'}
            >
              계산하러 가기
            </button>
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
          {context.receipt && (
            <div className="chatReceiptCard" aria-label="전자 영수증">
              <div className="chatReceiptHead">
                <span>전자 영수증</span>
                <strong>{context.receipt.items.length}권</strong>
              </div>
              <div className="chatReceiptQr" aria-label="보관함 추가 QR">
                <QRCodeSVG
                  value={context.receipt.qrPayload}
                  size={96}
                  marginSize={1}
                  bgColor="#ffffff"
                  fgColor="#111827"
                />
              </div>
              <code className="chatReceiptPayload breakAnywhere">{context.receipt.qrPayload}</code>
            </div>
          )}
        </section>

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
            처리 중
          </div>
        )}

        {actionCard && <ChatActionCard card={actionCard} disabled={busy} onSelect={(inputText) => void submitUserText(inputText)} />}

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
          <button
            type="button"
            className="chatTtsToggle"
            data-enabled={tts.enabled}
            onClick={() => tts.setEnabled(!tts.enabled)}
            aria-pressed={tts.enabled}
            aria-label={tts.enabled ? '음성 응답 끄기' : '음성 응답 켜기'}
          >
            {tts.enabled ? '음성 켜짐' : '음성 꺼짐'}
          </button>
          {tts.speaking && (
            <span className="chatTtsSpeaking" aria-live="polite">
              읽는 중
            </span>
          )}
        </div>

        <form className="chatForm" onSubmit={handleSubmit}>
          {speech.isSupported && speech.isListening && (
            <div className="chatMicPreviewBar">
              <div className="chatMicPreviewRow">
                <span className="chatMicPreviewStatus" aria-live="polite">
                  <span className="chatMicPreviewDot" aria-hidden />
                  듣는 중
                  {speech.livePreview ? (
                    <>
                      <span className="chatMicPreviewSep" aria-hidden>
                        ·
                      </span>
                      <span className="chatMicPreviewText">{speech.livePreview}</span>
                    </>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="chatMicPreviewCancel"
                  onClick={() => speech.cancelListening()}
                  disabled={busy}
                  aria-label="음성 인식 취소"
                >
                  인식 취소
                </button>
              </div>
            </div>
          )}
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
            {speech.isSupported && (
              <button
                type="button"
                className="chatMicButton"
                data-listening={speech.isListening}
                onClick={() => (speech.isListening ? speech.stopListening() : speech.startListening())}
                aria-label={speech.isListening ? '음성 인식 끝내고 입력에 넣기' : '음성으로 말하기 시작'}
                aria-pressed={speech.isListening}
                disabled={busy}
              >
                <span className="chatMicButtonInner">
                  {speech.isListening ? (
                    <svg className="chatMicIcon" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg
                      className="chatMicIcon"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3M8 22h8" />
                    </svg>
                  )}
                  <span className="chatMicButtonLabel">{speech.isListening ? '입력에 넣기' : '말하기'}</span>
                </span>
              </button>
            )}
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
