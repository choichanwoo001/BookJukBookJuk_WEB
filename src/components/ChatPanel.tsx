import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

const initialMessages: ChatMessage[] = [
  { id: 'a1', role: 'assistant', text: '강의실 3D 맵에 오신 것을 환영합니다.' },
  { id: 'a2', role: 'assistant', text: 'WASD로 이동하고, 시점은 정면 고정입니다.' },
]

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')

  const canSend = useMemo(() => draft.trim().length > 0, [draft])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
      },
    ])
    setDraft('')
  }

  return (
    <div className="chatPanel">
      <header className="chatHeader">
        <h2>채팅</h2>
        <p>맵 안내 및 메모</p>
      </header>

      <div className="chatMessages">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chatBubble ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            {message.text}
          </article>
        ))}
      </div>

      <form className="chatForm" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="메시지를 입력하세요"
          aria-label="메시지 입력"
        />
        <button type="submit" disabled={!canSend}>
          전송
        </button>
      </form>
    </div>
  )
}

export default ChatPanel
