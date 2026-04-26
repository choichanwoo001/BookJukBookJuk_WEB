import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './env'

let client: SupabaseClient | null = null
let warned = false

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client
  const env = readSupabaseEnv()
  if (!env) {
    if (!warned) {
      warned = true
      console.warn('[supabase] env not configured. using local fallback paths.')
    }
    return null
  }
  client = createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return client
}
