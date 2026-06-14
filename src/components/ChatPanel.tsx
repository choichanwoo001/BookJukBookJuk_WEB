import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ChatActionCard } from './ChatActionCard'
import { ConfirmationCard } from './ConfirmationCard'
import { VoiceStatusIndicator } from './VoiceStatusIndicator'
import type { VoiceCommandPhase } from '../hooks/useVoiceCommandLoop'
import type { UseTtsReturn } from '../hooks/useTts'
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
  tts,
  ttsSpeaking,
  voicePhase,
  voiceLivePreview,
  voiceSupported,
  voicePermissionDenied,
  voiceArmRemainingMs,
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
  actionCard: ChatActionCardModel | null
  tts: UseTtsReturn
  ttsSpeaking: boolean
  voicePhase: VoiceCommandPhase
  voiceLivePreview: string
  voiceSupported: boolean
  voicePermissionDenied: boolean
  voiceArmRemainingMs: number | null
}) {
  const [draft, setDraft] = useState('')
  const [receiptQrOpen, setReceiptQrOpen] = useState(false)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const receiptQrHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openReceiptQr = useCallback(() => {
    if (receiptQrHideTimerRef.current) {
      clearTimeout(receiptQrHideTimerRef.current)
      receiptQrHideTimerRef.current = null
    }
    setReceiptQrOpen(true)
  }, [])

  const scheduleCloseReceiptQr = useCallback(() => {
    if (receiptQrHideTimerRef.current) clearTimeout(receiptQrHideTimerRef.current)
    receiptQrHideTimerRef.current = setTimeout(() => setReceiptQrOpen(false), 280)
  }, [])

  useEffect(() => {
    return () => {
      if (receiptQrHideTimerRef.current) clearTimeout(receiptQrHideTimerRef.current)
    }
  }, [])

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
                  aria-label="전자 영수증 QR 보기"
                  aria-expanded={receiptQrOpen}
                  onMouseEnter={openReceiptQr}
                  onMouseLeave={scheduleCloseReceiptQr}
                  onFocus={openReceiptQr}
                  onBlur={scheduleCloseReceiptQr}
                >
                  영수증 QR
                </button>
              )}
              <button
                type="button"
                className="chatShelfLoadButton"
                onClick={() => void submitUserText('계산하러 가자')}
                disabled={busy || cartItems.length === 0 || context.checkoutStatus === 'going_to_counter'}
              >
                계산하러 가기
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

        {context.receipt &&
          receiptQrOpen &&
          createPortal(
            <div
              className="chatReceiptOverlay"
              role="dialog"
              aria-label="전자 영수증 QR"
              onMouseEnter={openReceiptQr}
              onMouseLeave={scheduleCloseReceiptQr}
            >
              <div className="chatReceiptOverlayCard">
                <div className="chatReceiptOverlayHead">
                  <span>전자 영수증</span>
                  <strong>{context.receipt.items.length}권</strong>
                </div>
                <p className="chatReceiptOverlayHint">앱에서 스캔하면 보관함에 추가돼요</p>
                <div className="chatReceiptOverlayQr" aria-hidden>
                  <QRCodeSVG
                    value={context.receipt.qrPayload}
                    size={220}
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#111827"
                  />
                </div>
                <code className="chatReceiptOverlayPayload breakAnywhere">{context.receipt.qrPayload}</code>
              </div>
            </div>,
            document.body,
          )}

        {context.pendingConfirmation && (
          <ConfirmationCard
            pending={context.pendingConfirmation}
            onConfirm={acceptConfirmation}
            onCancel={cancelConfirmation}
          />
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
          <VoiceStatusIndicator
            phase={voicePhase}
            livePreview={voiceLivePreview}
            isSupported={voiceSupported}
            permissionDenied={voicePermissionDenied}
            busy={busy}
            ttsSpeaking={ttsSpeaking}
            armRemainingMs={voiceArmRemainingMs}
          />
          <div className="chatVoiceBarControls">
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
