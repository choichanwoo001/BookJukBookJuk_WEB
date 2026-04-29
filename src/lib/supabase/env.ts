export type SupabaseRuntimeEnv = {
  url: string
  publishableKey: string
  defaultUserId: string
  qrLoginTtlSeconds: number
}

const FALLBACK_USER_ID = 'dev_test_user_1'
const FALLBACK_QR_LOGIN_TTL_SECONDS = 90

export function readSupabaseEnv(): SupabaseRuntimeEnv | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const defaultUserId = import.meta.env.VITE_APP_DEFAULT_USER_ID?.trim() || FALLBACK_USER_ID
  const ttlRaw = Number.parseInt(import.meta.env.VITE_QR_LOGIN_TTL_SECONDS?.trim() ?? '', 10)
  const qrLoginTtlSeconds =
    Number.isFinite(ttlRaw) && ttlRaw >= 30 && ttlRaw <= 300 ? ttlRaw : FALLBACK_QR_LOGIN_TTL_SECONDS

  if (!url || !publishableKey) {
    return null
  }

  return { url, publishableKey, defaultUserId, qrLoginTtlSeconds }
}

export function getDefaultUserId(): string {
  return import.meta.env.VITE_APP_DEFAULT_USER_ID?.trim() || FALLBACK_USER_ID
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null
}

export function getQrLoginTtlSeconds(): number {
  const ttlRaw = Number.parseInt(import.meta.env.VITE_QR_LOGIN_TTL_SECONDS?.trim() ?? '', 10)
  if (Number.isFinite(ttlRaw) && ttlRaw >= 30 && ttlRaw <= 300) return ttlRaw
  return FALLBACK_QR_LOGIN_TTL_SECONDS
}
