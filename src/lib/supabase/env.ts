export type SupabaseRuntimeEnv = {
  url: string
  publishableKey: string
  defaultUserId: string
}

const FALLBACK_USER_ID = 'dev-user-001'

export function readSupabaseEnv(): SupabaseRuntimeEnv | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const defaultUserId = import.meta.env.VITE_APP_DEFAULT_USER_ID?.trim() || FALLBACK_USER_ID

  if (!url || !publishableKey) {
    return null
  }

  return { url, publishableKey, defaultUserId }
}

export function getDefaultUserId(): string {
  return import.meta.env.VITE_APP_DEFAULT_USER_ID?.trim() || FALLBACK_USER_ID
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null
}
