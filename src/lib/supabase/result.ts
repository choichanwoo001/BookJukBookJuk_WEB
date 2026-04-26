/** Unified Supabase layer result for error propagation (W4). */
export type DbOk<T> = { ok: true; data: T }
export type DbErr = { ok: false; errorCode: string; message?: string }
export type DbResult<T> = DbOk<T> | DbErr

export const SUPABASE_NOT_CONFIGURED = 'SUPABASE_NOT_CONFIGURED'
export const SUPABASE_QUERY_FAILED = 'SUPABASE_QUERY_FAILED'
export const SUPABASE_PERMISSION_DENIED = 'SUPABASE_PERMISSION_DENIED'

export function notConfigured<T>(): DbResult<T> {
  return { ok: false, errorCode: SUPABASE_NOT_CONFIGURED, message: 'Supabase not configured' }
}

export function queryFailed(message?: string, code = SUPABASE_QUERY_FAILED): DbErr {
  return { ok: false, errorCode: code, message }
}

export function mapPostgrestError(err: { code?: string; message?: string } | null): DbErr {
  if (!err) return queryFailed()
  const c = err.code ?? ''
  if (c === '42501' || c === 'PGRST301' || /permission/i.test(err.message ?? '')) {
    return { ok: false, errorCode: SUPABASE_PERMISSION_DENIED, message: err.message }
  }
  return { ok: false, errorCode: SUPABASE_QUERY_FAILED, message: err.message }
}
