import { getSupabaseClient } from './client'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured } from './result'

export type BookPreview = {
  id: string
  title: string
  authors: string
  coverImageUrl: string
  kdcClassName: string
  sector: number
}

function mapBookRow(row: Record<string, unknown>): BookPreview {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    authors: String(row.authors ?? ''),
    coverImageUrl: String(row.cover_image_url ?? ''),
    kdcClassName: String(row.kdc_class_nm ?? ''),
    sector: Number(row.sector ?? 0),
  }
}

export async function fetchLocationRecommendations(limit = 3): Promise<DbResult<BookPreview[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const { data, error } = await supabase
    .from('books')
    .select('id,title,authors,cover_image_url,kdc_class_nm,sector')
    .order('sector', { ascending: true })
    .limit(limit)
  if (error) return mapPostgrestError(error)
  if (!data) return { ok: true, data: [] }
  return { ok: true, data: data.map((row) => mapBookRow(row as Record<string, unknown>)) }
}

export async function fetchRatingRecommendations(limit = 3): Promise<DbResult<BookPreview[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const { data: ratingsData, error: ratingsError } = await supabase
    .from('ratings')
    .select('books_id,score')
    .order('score', { ascending: false })
    .limit(50)
  if (ratingsError) return mapPostgrestError(ratingsError)
  if (!ratingsData) return { ok: true, data: [] }

  const uniqueBookIds = Array.from(
    new Set(
      ratingsData
        .map((row) => String((row as { books_id?: string }).books_id ?? ''))
        .filter((id) => id.length > 0),
    ),
  ).slice(0, limit * 2)

  if (uniqueBookIds.length === 0) return { ok: true, data: [] }
  const { data: booksData, error: booksError } = await supabase
    .from('books')
    .select('id,title,authors,cover_image_url,kdc_class_nm,sector')
    .in('id', uniqueBookIds)
    .limit(limit)
  if (booksError) return mapPostgrestError(booksError)
  if (!booksData) return { ok: true, data: [] }
  return { ok: true, data: booksData.map((row) => mapBookRow(row as Record<string, unknown>)) }
}

export async function findBookByIsbnOrTitle(input: {
  isbn13?: string
  title?: string
}): Promise<DbResult<BookPreview | null>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const isbn = input.isbn13?.trim()
  if (isbn) {
    const { data, error } = await supabase
      .from('books')
      .select('id,title,authors,cover_image_url,kdc_class_nm,sector')
      .eq('id', isbn)
      .maybeSingle()
    if (error) return mapPostgrestError(error)
    if (data) return { ok: true, data: mapBookRow(data as Record<string, unknown>) }
  }

  const title = input.title?.trim()
  if (title) {
    const { data, error } = await supabase
      .from('books')
      .select('id,title,authors,cover_image_url,kdc_class_nm,sector')
      .ilike('title', `%${title}%`)
      .limit(1)
    if (error) return mapPostgrestError(error)
    if (data && data.length > 0) {
      return { ok: true, data: mapBookRow(data[0] as Record<string, unknown>) }
    }
  }

  return { ok: true, data: null }
}
