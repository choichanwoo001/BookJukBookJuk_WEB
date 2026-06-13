import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentContext, AgentMessage, ShoppingListEntry } from '../../agent/types'
import {
  appendConversationMessage,
  createConversation,
} from '../../lib/supabase/conversation'
import { getDefaultUserId } from '../../lib/supabase/env'
import { getCurrentWebSessionUsersId } from '../../lib/supabase/qrLogin'
import { shelfListLoadUserMessage } from '../../lib/supabase/listLoadUi'
import { loadShelfBooks, mapListTypeToShelfType } from '../../lib/supabase/shelves'

function toContextShoppingList(items: { booksId: string; title: string; authors: string; coverImageUrl: string }[]) {
  return items.map((b) => ({
    booksId: b.booksId,
    title: b.title,
    authors: b.authors,
    coverImageUrl: b.coverImageUrl,
  }))
}

export function useChatAgentSession({
  contextRef,
  initialShoppingList,
  listType,
  setContext,
  setMessages,
  shouldAutoLoadShelf,
}: {
  contextRef: { current: AgentContext }
  initialShoppingList?: ShoppingListEntry[]
  listType: AgentContext['listType']
  setContext: (patch: Partial<AgentContext>) => void
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>
  shouldAutoLoadShelf: boolean
}) {
  const conversationIdRef = useRef<string | null>(null)
  const [listLoadStatus, setListLoadStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [listLoadMessage, setListLoadMessage] = useState<string | null>(null)
  const [activeUsersId, setActiveUsersId] = useState<string | null>(null)
  const [readyForUsersId, setReadyForUsersId] = useState<string | null>(null)
  const sessionReady = readyForUsersId !== null && readyForUsersId === activeUsersId

  useEffect(() => {
    let disposed = false
    const bootstrapSessionUser = async () => {
      const sessionResult = await getCurrentWebSessionUsersId()
      if (disposed) return
      if (sessionResult.ok && sessionResult.data) {
        setActiveUsersId(sessionResult.data)
        setContext({ activeUsersId: sessionResult.data })
        return
      }
      const fallbackUserId = getDefaultUserId()
      setActiveUsersId(fallbackUserId)
      setContext({ activeUsersId: fallbackUserId })
    }
    void bootstrapSessionUser()
    return () => {
      disposed = true
    }
  }, [setContext])

  useEffect(() => {
    if (!activeUsersId) return
    let disposed = false
    const initializeConversation = async () => {
      setMessages([])
      const conversationId = await createConversation(activeUsersId)
      if (disposed) return
      conversationIdRef.current = conversationId
      setReadyForUsersId(activeUsersId)
    }
    void initializeConversation()
    return () => {
      disposed = true
      conversationIdRef.current = null
    }
  }, [activeUsersId, setMessages])

  useEffect(() => {
    if (!activeUsersId || shouldAutoLoadShelf) return
    const syncInitialList = async () => {
      if (initialShoppingList && initialShoppingList.length > 0) {
        setContext({ shoppingList: initialShoppingList, cartItems: initialShoppingList })
      }
      setListLoadStatus('ok')
      setListLoadMessage(null)
    }
    void syncInitialList()
  }, [activeUsersId, initialShoppingList, setContext, shouldAutoLoadShelf])

  useEffect(() => {
    if (!activeUsersId || !shouldAutoLoadShelf) return
    let disposed = false
    const loadList = async () => {
      setListLoadStatus('loading')
      setListLoadMessage(null)
      const shelfType = mapListTypeToShelfType(listType)
      const res = await loadShelfBooks(activeUsersId, shelfType)
      if (disposed) return
      if (!res.ok) {
        setListLoadStatus('error')
        setListLoadMessage(shelfListLoadUserMessage(res.errorCode, res.message))
        return
      }
      const loaded = toContextShoppingList(res.data)
      setContext({ shoppingList: loaded, cartItems: loaded })
      setListLoadStatus('ok')
      setListLoadMessage(null)
    }
    void loadList()
    return () => {
      disposed = true
    }
  }, [activeUsersId, listType, setContext, shouldAutoLoadShelf])

  const appendAssistantConversationMessage = useCallback(async (text: string) => {
    if (!conversationIdRef.current) return
    await appendConversationMessage({
      conversationId: conversationIdRef.current,
      role: 'assistant',
      content: text,
    })
  }, [])

  const loadExistingListOnDemand = useCallback(async () => {
    if (!activeUsersId) return false
    setListLoadStatus('loading')
    setListLoadMessage(null)
    const shelfType = mapListTypeToShelfType(contextRef.current.listType)
    const res = await loadShelfBooks(activeUsersId, shelfType)
    if (!res.ok) {
      setListLoadStatus('error')
      setListLoadMessage(shelfListLoadUserMessage(res.errorCode, res.message))
      return false
    }
    const loaded = toContextShoppingList(res.data)
    setContext({ shoppingList: loaded, cartItems: loaded })
    setListLoadStatus('ok')
    setListLoadMessage(null)
    return true
  }, [activeUsersId, contextRef, setContext])

  return {
    activeUsersId,
    appendAssistantConversationMessage,
    conversationIdRef,
    listLoadMessage,
    listLoadStatus,
    loadExistingListOnDemand,
    sessionReady,
  }
}
