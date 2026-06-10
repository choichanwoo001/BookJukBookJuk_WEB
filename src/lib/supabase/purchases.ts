import type { CartItem, Receipt } from '../../agent/types'
import { addBookToShelf, updateBookUserState } from './shelves'
import { getSupabaseClient } from './client'
import type { DbResult } from './result'
import { mapPostgrestError, notConfigured } from './result'

function receiptQrPayload(receiptId: string, usersId: string): string {
  const params = new URLSearchParams({ receiptId, usersId })
  return `bookjuk://receipt?${params.toString()}`
}

export function buildLocalReceipt(usersId: string, items: CartItem[]): Receipt {
  const receiptId = crypto.randomUUID()
  return {
    receiptId,
    usersId,
    items,
    purchasedAt: new Date().toISOString(),
    qrPayload: receiptQrPayload(receiptId, usersId),
  }
}

export async function completeDemoPurchase(params: {
  usersId: string
  items: CartItem[]
}): Promise<DbResult<Receipt>> {
  const usersId = params.usersId.trim()
  const items = params.items.filter((item) => item.booksId.trim().length > 0)
  const receipt = buildLocalReceipt(usersId, items)
  const supabase = getSupabaseClient()
  if (!supabase) return notConfigured()

  const receiptInsert = await supabase.from('purchase_receipts').insert({
    receipt_id: receipt.receiptId,
    users_id: receipt.usersId,
    purchased_at: receipt.purchasedAt,
    qr_payload: receipt.qrPayload,
  })
  if (receiptInsert.error) return mapPostgrestError(receiptInsert.error)

  if (items.length > 0) {
    const itemRows = items.map((item, index) => ({
      receipt_id: receipt.receiptId,
      books_id: item.booksId,
      title_snapshot: item.title,
      authors_snapshot: item.authors ?? '',
      cover_image_url_snapshot: item.coverImageUrl ?? '',
      order_index: index,
    }))
    const itemsInsert = await supabase.from('purchase_receipt_items').insert(itemRows)
    if (itemsInsert.error) return mapPostgrestError(itemsInsert.error)
  }

  for (const item of items) {
    const shelfRes = await addBookToShelf({
      usersId: receipt.usersId,
      booksId: item.booksId,
      shelfType: '읽은',
    })
    if (!shelfRes.ok) {
      return { ok: false, errorCode: shelfRes.errorCode, message: shelfRes.message }
    }
    const stateRes = await updateBookUserState({
      usersId: receipt.usersId,
      booksId: item.booksId,
      shelfState: 'PURCHASED',
    })
    if (!stateRes.ok) {
      return { ok: false, errorCode: stateRes.errorCode, message: stateRes.message }
    }
  }

  return { ok: true, data: receipt }
}
