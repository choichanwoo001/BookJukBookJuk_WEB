import { getSupabaseClient } from './client'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured } from './result'

export type BookCacheHint = {
  isbn: string
  description: string
  authorBio: string
}

export async function getBookCacheHint(isbn: string): Promise<DbResult<BookCacheHint | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const normalized = isbn.trim()
  if (!normalized) return { ok: true, data: null }

  const { data, error } = await supabase
    .from('book_api_cache')
    .select('isbn,description,author_bio')
    .eq('isbn', normalized)
    .maybeSingle()

  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: null }
  return {
    ok: true,
    data: {
      isbn: String(data.isbn ?? normalized),
      description: String(data.description ?? ''),
      authorBio: String(data.author_bio ?? ''),
    },
  }
}
