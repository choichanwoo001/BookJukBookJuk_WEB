import { getSupabaseClient } from './client'

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

/** DB stores assistant as `ai`; app model uses `assistant` (W1). */
function mapDbRoleToAppRole(dbRole: string): 'user' | 'assistant' {
  if (dbRole === 'user') return 'user'
  if (dbRole === 'ai' || dbRole === 'assistant') return 'assistant'
  return 'assistant'
}

function mapAppRoleToDbRole(role: 'user' | 'assistant'): 'user' | 'ai' {
  return role === 'assistant' ? 'ai' : 'user'
}

export async function getOrCreateConversation(usersId: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data: existing, error: existingError } = await supabase
    .from('conversation')
    .select('conversation_id')
    .eq('users_id', usersId)
    .eq('type', 'agent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingError && existing?.conversation_id) {
    return String(existing.conversation_id)
  }

  return createConversation(usersId)
}

export async function createConversation(usersId: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const conversationId = crypto.randomUUID()
  const { error: insertError } = await supabase.from('conversation').insert({
    conversation_id: conversationId,
    users_id: usersId,
    type: 'agent',
  })
  if (insertError) return null
  return conversationId
}

export async function loadConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('conversation_messages_id,role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data.map((row) => ({
    id: String(row.conversation_messages_id),
    role: mapDbRoleToAppRole(String(row.role ?? '')),
    content: String(row.content ?? ''),
    createdAt: new Date(String(row.created_at ?? Date.now())).getTime(),
  }))
}

export async function appendConversationMessage(params: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  intent?: string
}): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false
  const { error } = await supabase.from('conversation_messages').insert({
    conversation_messages_id: crypto.randomUUID(),
    conversation_id: params.conversationId,
    role: mapAppRoleToDbRole(params.role),
    content: params.content,
    intent: params.intent,
  })
  return !error
}
