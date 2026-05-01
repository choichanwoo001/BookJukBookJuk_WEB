import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useChatAgent } from '../hooks/useChatAgent'
import { ConfirmationCard } from './ConfirmationCard'
import { ChatActionCard } from './ChatActionCard'
import { mapListTypeToShelfType } from '../lib/supabase/shelves'
import type { StartMode } from '../types/startMode'

function ChatPanel({
  activePane,
  onActivateChat,
  startMode,
}: {
  activePane: 'map' | 'chat'
  onActivateChat: () => void
  startMode: StartMode
}) {
  const [draft, setDraft] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const {
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
    loadExistingListOnDemand,
    actionCard,
  } = useChatAgent({ startMode })

  const canSend = useMemo(() => draft.trim().length > 0 && !busy, [draft, busy])
  const shelfKind = mapListTypeToShelfType(context.listType)
  const shelfTitle = '내 리스트'
  const isBuildMode = startMode === 'build_list_chat'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim() || busy) {
      return
    }
    await submitUserText(draft)
    setDraft('')
  }

  useEffect(() => {
    const listEl = messageListRef.current
    if (!listEl) return
    listEl.scrollTop = listEl.scrollHeight
  }, [messages, startMode])

  return (
    <div
      className="chatPanelWrap"
      data-active-pane={activePane === 'chat'}
      onPointerDown={onActivateChat}
      onFocusCapture={onActivateChat}
    >
      <div className="chatPanel">
        <section className="chatShelfList" aria-label="불러온 서가 리스트">
          <div className="chatShelfListHead">
            <span className="chatShelfListTitle">{shelfTitle}</span>
            <span className="chatShelfListMeta">
              {shelfKind}
              {context.listType !== shelfKind ? ` · 표시: ${context.listType}` : ''} · {context.shoppingList.length}권
            </span>
            {isBuildMode && (
              <button
                type="button"
                className="chatShelfLoadButton"
                onClick={() => void loadExistingListOnDemand()}
                disabled={listLoadStatus === 'loading'}
              >
                기존 리스트 불러오기
              </button>
            )}
          </div>
          {listLoadStatus === 'loading' ? (
            <p className="chatShelfListEmpty chatShelfListLoading">리스트를 불러오는 중이에요…</p>
          ) : listLoadStatus === 'error' ? (
            <p className="chatShelfListEmpty chatShelfListError">{listLoadMessage ?? '리스트를 불러오지 못했어요.'}</p>
          ) : context.shoppingList.length === 0 ? (
            <p className="chatShelfListEmpty">
              {startMode === 'build_list_chat'
                ? '새 리스트로 시작했어요. 채팅으로 책을 추가하거나 기존 리스트를 불러올 수 있어요.'
                : startMode === 'browse_no_list'
                  ? '현재는 비어 있어요. 탐색 중 추천을 선택하면 쇼핑리스트에 쌓여요.'
                  : '서가에 담긴 책이 없어요.'}
            </p>
          ) : (
            <ul className="chatShelfListItems">
              {context.shoppingList.map((b) => (
                <li key={b.booksId} className="chatShelfListItem" title={b.booksId}>
                  <div className="chatShelfBookThumbWrap" aria-hidden>
                    {b.coverImageUrl ? (
                      <img className="chatShelfBookThumb" src={b.coverImageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="chatShelfBookThumb chatShelfBookThumbPlaceholder">NO IMAGE</div>
                    )}
                  </div>
                  <div className="chatShelfBookText">
                    <p className="chatShelfBookTitle">{b.title}</p>
                    <p className="chatShelfBookAuthor">{b.authors?.trim() || '작가 정보 없음'}</p>
                  </div>
                </li>
              ))}
            </ul>
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
            처리 중…
          </div>
        )}

        {actionCard && <ChatActionCard card={actionCard} disabled={busy} onSelect={(inputText) => void submitUserText(inputText)} />}

        <div ref={messageListRef} className="chatMessages">
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
            rows={2}
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
