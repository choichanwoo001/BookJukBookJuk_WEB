import { getSupabaseClient } from './client'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured, queryFailed } from './result'

export type ShelfType = '평가한' | '읽은' | '읽는중' | '쇼핑리스트'
export type BookUserState = 'LIST' | 'READING' | 'RATED_ONLY' | 'REVIEW_POSTED' | 'PURCHASED'

export type ShelfBookItem = {
  booksId: string
  title: string
  authors: string
  coverImageUrl: string
}

export function mapListTypeToShelfType(listType?: string): ShelfType {
  if (listType === '읽는중') return '읽는중'
  if (listType === '읽은') return '읽은'
  if (listType === '평가한') return '평가한'
  return '쇼핑리스트'
}

export async function getOrCreateShelf(usersId: string, shelfType: ShelfType): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data: existing, error: existingError } = await supabase
    .from('shelves')
    .select('shelves_id')
    .eq('users_id', usersId)
    .eq('shelf_type', shelfType)
    .limit(1)
    .maybeSingle()

  if (!existingError && existing?.shelves_id) {
    return String(existing.shelves_id)
  }

  const shelvesId = crypto.randomUUID()
  const { error: insertError } = await supabase.from('shelves').insert({
    shelves_id: shelvesId,
    users_id: usersId,
    shelf_type: shelfType,
  })
  if (insertError) return null
  return shelvesId
}

/** Load books on a shelf via shelf_books + books (W8). Does not create a shelf row. */
export async function loadShelfBooks(usersId: string, shelfType: ShelfType): Promise<DbResult<ShelfBookItem[]>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const { data: shelfRow, error: shelfErr } = await supabase
    .from('shelves')
    .select('shelves_id')
    .eq('users_id', usersId)
    .eq('shelf_type', shelfType)
    .maybeSingle()

  if (shelfErr) return mapPostgrestError(shelfErr)
  if (!shelfRow?.shelves_id) return { ok: true, data: [] }

  const shelfId = String(shelfRow.shelves_id)
  const { data: linkRows, error: linkErr } = await supabase.from('shelf_books').select('books_id').eq('shelves_id', shelfId)
  if (linkErr) return mapPostgrestError(linkErr)
  if (!linkRows || linkRows.length === 0) return { ok: true, data: [] }

  const bookIds = Array.from(
    new Set(
      linkRows
        .map((r) => String((r as { books_id?: string }).books_id ?? ''))
        .filter((id) => id.length > 0),
    ),
  )
  if (bookIds.length === 0) return { ok: true, data: [] }

  const { data: books, error: booksErr } = await supabase
    .from('books')
    .select('id,title,authors,cover_image_url')
    .in('id', bookIds)

  if (booksErr) return mapPostgrestError(booksErr)
  if (!books) return { ok: true, data: [] }

  const items: ShelfBookItem[] = books.map((row) => ({
    booksId: String((row as { id?: string }).id ?? ''),
    title: String((row as { title?: string }).title ?? ''),
    authors: String((row as { authors?: string }).authors ?? ''),
    coverImageUrl: String((row as { cover_image_url?: string }).cover_image_url ?? ''),
  }))
  return { ok: true, data: items.filter((b) => b.booksId.length > 0) }
}

export async function addBookToShelf(params: {
  usersId: string
  booksId: string
  shelfType: ShelfType
}): Promise<DbResult<boolean>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const shelfId = await getOrCreateShelf(params.usersId, params.shelfType)
  if (!shelfId) return queryFailed('Failed to get or create shelf')
  const { error } = await supabase.from('shelf_books').upsert(
    {
      books_id: params.booksId,
      shelves_id: shelfId,
    },
    { onConflict: 'books_id,shelves_id' },
  )
  if (error) return mapPostgrestError(error)
  return { ok: true, data: true }
}

export async function removeBookFromShelf(params: {
  usersId: string
  booksId: string
  shelfType: ShelfType
}): Promise<DbResult<boolean>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const shelfId = await getOrCreateShelf(params.usersId, params.shelfType)
  if (!shelfId) return queryFailed('Failed to get or create shelf')
  const { error } = await supabase
    .from('shelf_books')
    .delete()
    .eq('books_id', params.booksId)
    .eq('shelves_id', shelfId)
  if (error) return mapPostgrestError(error)
  return { ok: true, data: true }
}

export async function updateBookUserState(params: {
  usersId: string
  booksId: string
  shelfState: BookUserState
}): Promise<DbResult<boolean>> {
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()
  const { error } = await supabase.from('book_user_states').upsert(
    {
      users_id: params.usersId,
      books_id: params.booksId,
      shelf_state: params.shelfState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'users_id,books_id' },
  )
  if (error) return mapPostgrestError(error)
  return { ok: true, data: true }
}
