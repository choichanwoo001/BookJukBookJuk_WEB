import {
  findBestFuzzyShoppingListMatch,
  matchShoppingListByTitleHint,
  normalizeListHint,
} from '../listHintNormalize'
import type { ShoppingListToolData, ToolExecutionContext, ToolResult } from '../types'
import type { ToolDefinition } from './types'
import { validateShoppingListArgs } from './toolValidators'
import { findBookByIsbnOrTitle, findBookCandidatesByTitle, type BookPreview } from '../../lib/supabase/books'
import { getBookCacheHint } from '../../lib/supabase/cache'
import {
  addBookToShelf,
  mapListTypeToShelfType,
  removeBookFromShelf,
  updateBookUserState,
} from '../../lib/supabase/shelves'
import { getDefaultUserId } from '../../lib/supabase/env'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'

const TOOL_NAME = 'shoppingListTool'
const FUZZY_AUTO_ACCEPT_SCORE = 0.78
const FUZZY_AMBIGUOUS_GAP = 0.08

function catalogMissResult(): ToolResult {
  return {
    ok: false,
    toolName: TOOL_NAME,
    message: '해당 책은 서점에 없습니다.',
    errorCode: 'BOOK_NOT_IN_CATALOG',
  }
}

function canonicalizeAction(action: unknown): string {
  if (typeof action !== 'string') return ''
  const normalized = action.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'delete') return 'remove'
  return normalized
}

function toShoppingListData(
  entries: { booksId: string; title: string; authors?: string; coverImageUrl?: string }[],
): ShoppingListToolData['shoppingList'] {
  return entries.map((b) => ({
    booksId: b.booksId,
    title: b.title,
    authors: b.authors,
    coverImageUrl: b.coverImageUrl,
  }))
}

async function buildCacheSummary(isbn13?: string): Promise<string> {
  if (!isbn13) return ''
  const hintRes = await getBookCacheHint(isbn13)
  if (!hintRes.ok || !hintRes.data?.description) return ''
  const d = hintRes.data.description
  return ` 요약: ${d.slice(0, 60)}${d.length > 60 ? '...' : ''}`
}

async function finishAddWithBook(
  matchedBook: BookPreview,
  displayTitle: string,
  ctx: ToolExecutionContext,
  cacheIsbn?: string,
): Promise<ToolResult> {
  const userId = getDefaultUserId()
  const shelfType = mapListTypeToShelfType(ctx.getContext().listType)

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

  const cacheSummary = await buildCacheSummary(cacheIsbn)

  const list = ctx.getContext().shoppingList
  const exists = list.some((b) => b.booksId === matchedBook.id)
  const nextList = exists
    ? list
    : [
        ...list,
        {
          booksId: matchedBook.id,
          title: matchedBook.title || displayTitle,
          authors: matchedBook.authors,
          coverImageUrl: matchedBook.coverImageUrl,
        },
      ]
  ctx.setContext({ shoppingList: nextList })

  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `리스트에 "${displayTitle}"을(를) 추가했어요.${cacheSummary}`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

async function finishRemoveWithBook(
  matchedBook: BookPreview,
  displayTitle: string,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const userId = getDefaultUserId()
  const shelfType = mapListTypeToShelfType(ctx.getContext().listType)

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
    message: `리스트에서 "${displayTitle}"을(를) 제거했어요.`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

function previewFromShelfEntry(entry: {
  booksId: string
  title: string
  authors?: string
  coverImageUrl?: string
}): BookPreview {
  return {
    id: entry.booksId,
    title: entry.title,
    authors: entry.authors ?? '',
    coverImageUrl: entry.coverImageUrl ?? '',
    kdcClassName: '',
    sector: 0,
  }
}

function candidateTitlesLine(titles: string[]): string {
  return titles.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join(' / ')
}

async function handleAdd(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const rawHint = typeof args.hint === 'string' ? args.hint : ''
  const hint = normalizeListHint(rawHint, 'add')
  if (!hint) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '추가할 책 제목을 함께 적어 주세요. 예: "책 추가 미움받을 용기"',
      errorCode: 'HINT_EMPTY',
    }
  }

  const catRes = await findBookByIsbnOrTitle({ title: hint })
  if (!catRes.ok) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: catRes.message ?? 'DB 조회에 실패했어요.',
      errorCode: catRes.errorCode,
    }
  }
  if (catRes.data?.id) {
    return finishAddWithBook(catRes.data, catRes.data.title || hint, ctx)
  }

  const fuzzyRes = await findBookCandidatesByTitle(hint, 3)
  if (!fuzzyRes.ok) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: fuzzyRes.message ?? '유사 제목 검색에 실패했어요.',
      errorCode: fuzzyRes.errorCode,
    }
  }
  const [top, second] = fuzzyRes.data
  if (top?.book?.id) {
    const gap = second ? top.score - second.score : 1
    if (top.score >= FUZZY_AUTO_ACCEPT_SCORE && gap >= FUZZY_AMBIGUOUS_GAP) {
      return finishAddWithBook(top.book, top.book.title || hint, ctx)
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: `제목이 모호해요. 혹시 이 중 하나인가요? ${candidateTitlesLine(fuzzyRes.data.map((c) => c.book.title))}`,
      errorCode: 'BOOK_MATCH_AMBIGUOUS',
    }
  }

  return catalogMissResult()
}

async function handleRemove(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const rawHint = typeof args.hint === 'string' ? args.hint : ''
  const hint = normalizeListHint(rawHint, 'remove')
  if (!hint) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '제거할 책 제목을 함께 적어 주세요. 예: "책 제거 미움받을 용기"',
      errorCode: 'HINT_EMPTY',
    }
  }

  const list = ctx.getContext().shoppingList
  const visMatches = matchShoppingListByTitleHint(list, hint)
  if (visMatches.length > 1) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '목록에서 여러 권이 맞아요. 더 구체적인 제목을 적어 주세요.',
      errorCode: 'AMBIGUOUS_REMOVE',
    }
  }
  if (visMatches.length === 1) {
    const matched = previewFromShelfEntry(visMatches[0])
    return finishRemoveWithBook(matched, visMatches[0].title, ctx)
  }

  const fuzzyMatch = findBestFuzzyShoppingListMatch(list, hint)
  if (fuzzyMatch) {
    const matched = previewFromShelfEntry(fuzzyMatch)
    return finishRemoveWithBook(matched, fuzzyMatch.title, ctx)
  }

  const catRes = await findBookByIsbnOrTitle({ title: hint })
  if (!catRes.ok) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: catRes.message ?? 'DB 조회에 실패했어요.',
      errorCode: catRes.errorCode,
    }
  }
  if (catRes.data?.id) {
    return finishRemoveWithBook(catRes.data, catRes.data.title || hint, ctx)
  }

  const fuzzyRes = await findBookCandidatesByTitle(hint, 3)
  if (!fuzzyRes.ok) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: fuzzyRes.message ?? '유사 제목 검색에 실패했어요.',
      errorCode: fuzzyRes.errorCode,
    }
  }
  const [top, second] = fuzzyRes.data
  if (top?.book?.id) {
    const gap = second ? top.score - second.score : 1
    if (top.score >= FUZZY_AUTO_ACCEPT_SCORE && gap >= FUZZY_AMBIGUOUS_GAP) {
      return finishRemoveWithBook(top.book, top.book.title || hint, ctx)
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: `제목이 모호해요. 혹시 이 중 하나인가요? ${candidateTitlesLine(fuzzyRes.data.map((c) => c.book.title))}`,
      errorCode: 'BOOK_MATCH_AMBIGUOUS',
    }
  }

  return catalogMissResult()
}

export const shoppingListTool: ToolDefinition = {
  name: TOOL_NAME,
  validate(args) {
    return validateShoppingListArgs(args)
  },
  async run(args, ctx) {
    const action = canonicalizeAction(args.action)
    if (action === 'add') return handleAdd(args, ctx)
    if (action === 'remove') return handleRemove(args, ctx)
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '지원하지 않는 리스트 액션입니다.',
      errorCode: 'INVALID_ACTION',
    }
  },
}
