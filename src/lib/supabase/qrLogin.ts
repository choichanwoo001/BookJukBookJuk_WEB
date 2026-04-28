import { getSupabaseClient } from './client'
import { getQrLoginTtlSeconds } from './env'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured, queryFailed } from './result'

const QR_SESSION_STORAGE_KEY = 'bookjuk_web_session_token'

export type QrLoginTicket = {
  id: string
  token: string
  expiresAt: number
}

export type QrLoginTicketStatus = 'pending' | 'approved' | 'used' | 'expired' | 'cancelled'

export type QrLoginTicketSnapshot = {
  ticketId: string
  status: QrLoginTicketStatus
  approvedUserId: string | null
  expiresAt: number
}

export function extractQrTokenFromDeepLink(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.searchParams.get('token')?.trim() ?? ''
  } catch {
    return ''
  }
}

function toIsoTimestamp(ms: number): string {
  return new Date(ms).toISOString()
}

function randomToken(bytes = 24): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  let s = ''
  for (const n of raw) s += String.fromCharCode(n)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function mapSnapshotRow(row: Record<string, unknown>): QrLoginTicketSnapshot {
  return {
    ticketId: String(row.id ?? ''),
    status: String(row.status ?? 'pending') as QrLoginTicketStatus,
    approvedUserId: row.approved_user_id ? String(row.approved_user_id) : null,
    expiresAt: new Date(String(row.expires_at ?? Date.now())).getTime(),
  }
}

export async function createQrLoginTicket(): Promise<DbResult<QrLoginTicket>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = Date.now() + getQrLoginTtlSeconds() * 1000
  const { data, error } = await supabase
    .from('login_tickets')
    .insert({
      qr_token_hash: tokenHash,
      status: 'pending',
      expires_at: toIsoTimestamp(expiresAt),
    })
    .select('id')
    .single()
  if (error || !data) return mapPostgrestError(error)
  return {
    ok: true,
    data: {
      id: String(data.id ?? ''),
      token,
      expiresAt,
    },
  }
}

export async function approveQrLoginTicket(input: {
  token: string
  approvedUserId: string
}): Promise<DbResult<{ ticketId: string }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const token = input.token.trim()
  const approvedUserId = input.approvedUserId.trim()
  if (!token || !approvedUserId) return queryFailed('MISSING_REQUIRED_FIELDS')

  const tokenHash = await sha256Hex(token)
  const nowIso = toIsoTimestamp(Date.now())
  const { data, error } = await supabase
    .from('login_tickets')
    .update({
      status: 'approved',
      approved_user_id: approvedUserId,
      approved_at: nowIso,
    })
    .eq('qr_token_hash', tokenHash)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .is('used_at', null)
    .select('id')
    .single()
  if (error || !data) return mapPostgrestError(error)
  return { ok: true, data: { ticketId: String(data.id ?? '') } }
}

export async function getQrLoginTicketSnapshot(token: string): Promise<DbResult<QrLoginTicketSnapshot | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const normalizedToken = token.trim()
  if (!normalizedToken) return { ok: true, data: null }

  const tokenHash = await sha256Hex(normalizedToken)
  const { data, error } = await supabase
    .from('login_tickets')
    .select('id,status,approved_user_id,expires_at')
    .eq('qr_token_hash', tokenHash)
    .maybeSingle()
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: null }
  return { ok: true, data: mapSnapshotRow(data as Record<string, unknown>) }
}

export async function consumeApprovedTicketAndIssueWebSession(input: {
  token: string
  webSessionSeconds?: number
}): Promise<DbResult<{ usersId: string }>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const token = input.token.trim()
  if (!token) return queryFailed('EMPTY_QR_TOKEN')

  const snapshotResult = await getQrLoginTicketSnapshot(token)
  if (!snapshotResult.ok) return snapshotResult
  const snapshot = snapshotResult.data
  if (!snapshot || snapshot.status !== 'approved' || !snapshot.approvedUserId) {
    return queryFailed('TICKET_NOT_APPROVED')
  }

  const now = Date.now()
  if (snapshot.expiresAt <= now) return queryFailed('TICKET_EXPIRED')

  const nowIso = toIsoTimestamp(now)
  const markUsed = await supabase
    .from('login_tickets')
    .update({ status: 'used', used_at: nowIso })
    .eq('id', snapshot.ticketId)
    .eq('status', 'approved')
    .is('used_at', null)
    .select('id')
    .single()
  if (markUsed.error || !markUsed.data) return mapPostgrestError(markUsed.error)

  const sessionToken = randomToken(32)
  const sessionTokenHash = await sha256Hex(sessionToken)
  const sessionSeconds = input.webSessionSeconds && input.webSessionSeconds > 0 ? input.webSessionSeconds : 3600
  const sessionExpiresAt = now + sessionSeconds * 1000
  const sessionInsert = await supabase.from('web_sessions').insert({
    session_token_hash: sessionTokenHash,
    users_id: snapshot.approvedUserId,
    expires_at: toIsoTimestamp(sessionExpiresAt),
  })
  if (sessionInsert.error) return mapPostgrestError(sessionInsert.error)

  localStorage.setItem(QR_SESSION_STORAGE_KEY, sessionToken)
  return { ok: true, data: { usersId: snapshot.approvedUserId } }
}

export async function getCurrentWebSessionUsersId(): Promise<DbResult<string | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const token = localStorage.getItem(QR_SESSION_STORAGE_KEY)?.trim() ?? ''
  if (!token) return { ok: true, data: null }

  const tokenHash = await sha256Hex(token)
  const nowIso = toIsoTimestamp(Date.now())
  const { data, error } = await supabase
    .from('web_sessions')
    .select('users_id')
    .eq('session_token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) return mapPostgrestError(error)
  if (!data?.users_id) return { ok: true, data: null }
  return { ok: true, data: String(data.users_id) }
}

export function clearCurrentWebSession(): void {
  localStorage.removeItem(QR_SESSION_STORAGE_KEY)
}
