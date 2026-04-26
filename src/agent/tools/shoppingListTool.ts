import { getBookRecognitionClient, type BookRecognitionResult } from '../bridges/bookRecognitionBridge'
import type { ShoppingListToolData, ToolExecutionContext, ToolResult } from '../types'
import type { ToolDefinition } from './types'
import { validateShoppingListArgs } from './toolValidators'
import { findBookByIsbnOrTitle, type BookPreview } from '../../lib/supabase/books'
import { getBookCacheHint } from '../../lib/supabase/cache'
import {
  addBookToShelf,
  loadShelfBooks,
  mapListTypeToShelfType,
  removeBookFromShelf,
  updateBookUserState,
  type ShelfType,
} from '../../lib/supabase/shelves'
import { getDefaultUserId } from '../../lib/supabase/env'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'

const TOOL_NAME = 'shoppingListTool'

function toShoppingListData(
  entries: { booksId: string; title: string }[],
): ShoppingListToolData['shoppingList'] {
  return entries.map((b) => ({ booksId: b.booksId, title: b.title }))
}

type ResolvedBook = {
  recognized: BookRecognitionResult
  matchedBook: BookPreview
  userId: string
  shelfType: ShelfType
}

type ResolveBookOutcome =
  | { ok: true; resolved: ResolvedBook }
  | { ok: false; toolResult: ToolResult }

/**
 * Shared add/remove preprocessing:
 * book recognition → catalog match → user/shelf resolution.
 * Failures are converted to a ready-to-return `ToolResult`.
 */
async function resolveBookFromHint(
  args: Record<string, unknown>,
  reason: 'add' | 'remove',
  ctx: ToolExecutionContext,
): Promise<ResolveBookOutcome> {
  const bridge = getBookRecognitionClient()
  const recognized = await bridge.identifyBook({
    reason,
    hintText: typeof args.hint === 'string' ? args.hint : undefined,
  })
  if (!recognized.ok || !recognized.title) {
    return {
      ok: false,
      toolResult: {
        ok: false,
        toolName: TOOL_NAME,
        message: recognized.message,
        errorCode: recognized.errorCode ?? 'BOOK_NOT_RECOGNIZED',
      },
    }
  }

  const matchedRes = await findBookByIsbnOrTitle({
    isbn13: recognized.isbn13,
    title: recognized.title,
  })
  if (!matchedRes.ok) {
    return {
      ok: false,
      toolResult: {
        ok: false,
        toolName: TOOL_NAME,
        message: matchedRes.message ?? 'DB 조회에 실패했어요.',
        errorCode: matchedRes.errorCode,
      },
    }
  }

  const matchedBook = matchedRes.data
  if (!matchedBook?.id) {
    return {
      ok: false,
      toolResult: {
        ok: false,
        toolName: TOOL_NAME,
        message: `DB에서 "${recognized.title}"을(를) 찾지 못했어요.`,
        errorCode: 'BOOK_NOT_IN_CATALOG',
      },
    }
  }

  return {
    ok: true,
    resolved: {
      recognized,
      matchedBook,
      userId: getDefaultUserId(),
      shelfType: mapListTypeToShelfType(ctx.getContext().listType),
    },
  }
}

async function buildCacheSummary(isbn13?: string): Promise<string> {
  if (!isbn13) return ''
  const hintRes = await getBookCacheHint(isbn13)
  if (!hintRes.ok || !hintRes.data?.description) return ''
  const d = hintRes.data.description
  return ` 요약: ${d.slice(0, 60)}${d.length > 60 ? '...' : ''}`
}

async function handleAdd(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const outcome = await resolveBookFromHint(args, 'add', ctx)
  if (!outcome.ok) return outcome.toolResult
  const { recognized, matchedBook, userId, shelfType } = outcome.resolved

  const addRes = await addBookToShelf({ usersId: userId, booksId: matchedBook.id, shelfType })
  if (!addRes.ok) {
    if (addRes.errorCode === SUPABASE_NOT_CONFIGURED) {
      return {
        ok: false,
        toolName: TOOL_NAME,
        message: 'Supabase가 설정되지 않아 리스트에 반영할 수 없어요.',
        errorCode: addRes.errorCode,
      }
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: addRes.message ?? '서가에 추가하지 못했어요.',
      errorCode: addRes.errorCode,
    }
  }

  const stateRes = await updateBookUserState({ usersId: userId, booksId: matchedBook.id, shelfState: 'LIST' })
  if (!stateRes.ok && stateRes.errorCode !== SUPABASE_NOT_CONFIGURED) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: stateRes.message ?? '상태 업데이트에 실패했어요.',
      errorCode: stateRes.errorCode,
    }
  }

  const cacheSummary = await buildCacheSummary(recognized.isbn13)

  const list = ctx.getContext().shoppingList
  const exists = list.some((b) => b.booksId === matchedBook.id)
  const nextList = exists
    ? list
    : [...list, { booksId: matchedBook.id, title: matchedBook.title || (recognized.title ?? '') }]
  ctx.setContext({ shoppingList: nextList })

  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `리스트에 "${recognized.title}"을(를) 추가했어요.${cacheSummary}`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

async function handleRemove(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const outcome = await resolveBookFromHint(args, 'remove', ctx)
  if (!outcome.ok) return outcome.toolResult
  const { recognized, matchedBook, userId, shelfType } = outcome.resolved

  const rmRes = await removeBookFromShelf({ usersId: userId, booksId: matchedBook.id, shelfType })
  if (!rmRes.ok && rmRes.errorCode !== SUPABASE_NOT_CONFIGURED) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: rmRes.message ?? '서가에서 제거하지 못했어요.',
      errorCode: rmRes.errorCode,
    }
  }

  const list = ctx.getContext().shoppingList
  const nextList = list.filter((b) => b.booksId !== matchedBook.id)
  ctx.setContext({ shoppingList: nextList })

  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `리스트에서 "${recognized.title}"을(를) 제거했어요.`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

async function handleChangeType(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const listType = typeof args.listType === 'string' ? args.listType : '쇼핑리스트'
  const userId = getDefaultUserId()
  const shelfType = mapListTypeToShelfType(listType)
  const loaded = await loadShelfBooks(userId, shelfType)
  if (!loaded.ok) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: loaded.message ?? '리스트를 불러오지 못했어요.',
      errorCode: loaded.errorCode,
    }
  }
  const shoppingList = loaded.data.map((b) => ({ booksId: b.booksId, title: b.title }))
  ctx.setContext({ listType, shoppingList })
  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `리스트 종류를 "${listType}"로 변경했어요.`,
    data: { shoppingList },
  }
}

function handleUpdateQuantity(args: Record<string, unknown>): ToolResult {
  const quantity = typeof args.quantity === 'number' ? args.quantity : 1
  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `수량 변경 요청을 반영했어요. (요청 수량: ${quantity})`,
  }
}

export const shoppingListTool: ToolDefinition = {
  name: TOOL_NAME,
  validate(args) {
    return validateShoppingListArgs(args)
  },
  async run(args, ctx) {
    const action = String(args.action)
    if (action === 'add') return handleAdd(args, ctx)
    if (action === 'remove') return handleRemove(args, ctx)
    if (action === 'changeType') return handleChangeType(args, ctx)
    if (action === 'updateQuantity') return handleUpdateQuantity(args)
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '지원하지 않는 리스트 액션입니다.',
      errorCode: 'INVALID_ACTION',
    }
  },
}
