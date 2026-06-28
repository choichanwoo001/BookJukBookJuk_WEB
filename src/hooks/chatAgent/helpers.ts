import type { AgentMessage } from '../../agent/types'
import { appendConversationMessage } from '../../lib/supabase/conversation'
import type { Dispatch, SetStateAction } from 'react'

export function createUserMessage(text: string): AgentMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    text,
    createdAt: Date.now(),
  }
}

export async function appendUserMessageAndStore(params: {
  text: string
  conversationId: string | null
  intent?: string
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>
}): Promise<void> {
  const { text, conversationId, intent, setMessages } = params
  setMessages((prev) => [...prev, createUserMessage(text)])
  if (!conversationId) return
  await appendConversationMessage({
    conversationId,
    role: 'user',
    content: text,
    intent,
  })
}
