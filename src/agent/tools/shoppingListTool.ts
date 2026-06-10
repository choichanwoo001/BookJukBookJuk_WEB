import {
  findBestFuzzyShoppingListMatch,
  matchShoppingListByTitleHint,
  normalizeListHint,
  shoppingListSkipRecognition,
} from '../listHintNormalize'
import { getBookRecognitionClient, type BookRecognitionResult } from '../bridges/bookRecognitionBridge'
import type { ShoppingListToolData, ToolExecutionContext, ToolResult } from '../types'
import type { ToolDefinition } from './types'
import { validateShoppingListArgs } from './toolValidators'
import { findBookByIsbnOrTitle, findBookCandidatesByTitle, type BookPreview } from '../../lib/supabase/books'
import { getBookCacheHint } from '../../lib/supabase/cache'

const TOOL_NAME = 'shoppingListTool'
const FUZZY_AUTO_ACCEPT_SCORE = 0.78
const FUZZY_AMBIGUOUS_GAP = 0.08
const SYSTEM_FAILURE_CODES = new Set([
  'HTTP_UNREACHABLE',
  'HTTP_BAD_GATEWAY',
  'HTTP_502',
  'HTTP_CLIENT_ERROR',
  'BRIDGE_TIMEOUT',
  'BRIDGE_PROCESS_ERROR',
])
const MATCH_FAILURE_CODES = new Set(['BOOK_NOT_IN_CATALOG', 'BOOK_NOT_RECOGNIZED'])

export function classifyListFailure(code?: string): 'system' | 'match' | 'other' {
  if (!code) return 'other'
  if (SYSTEM_FAILURE_CODES.has(code) || /^HTTP_5\d\d$/.test(code)) return 'system'
  if (MATCH_FAILURE_CODES.has(code)) return 'match'
  return 'other'
}

function catalogMissResult(): ToolResult {
  return {
    ok: false,
    toolName: TOOL_NAME,
    message: '해당 책을 매장 DB에서 찾지 못했어요.',
    errorCode: 'BOOK_NOT_IN_CATALOG',
  }
}

function listRemoveUnmatchedResult(): ToolResult {
  return {
    ok: false,
    toolName: TOOL_NAME,
    message: '현재 장바구니에서 해당 책을 찾지 못했어요. 제목을 확인하거나 장바구니에 있는 표기와 같이 적어 주세요.',
    errorCode: 'LIST_REMOVE_UNMATCHED',
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

function currentCart(ctx: ToolExecutionContext) {
  const context = ctx.getContext()
  return context.cartItems.length > 0 ? context.cartItems : context.shoppingList
}

async function finishAddWithBook(
  matchedBook: BookPreview,
  displayTitle: string,
  ctx: ToolExecutionContext,
  cacheIsbn?: string,
): Promise<ToolResult> {
  const list = currentCart(ctx)
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
  ctx.setContext({ cartItems: nextList, shoppingList: nextList })
  const cacheSummary = await buildCacheSummary(cacheIsbn)

  return {
    ok: true,
    toolName: TOOL_NAME,
    message: exists
      ? `이미 장바구니에 "${displayTitle}"이 있어요.${cacheSummary}`
      : `장바구니에 "${displayTitle}"을 담았어요.${cacheSummary}`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

async function finishRemoveWithBook(
  matchedBook: BookPreview,
  displayTitle: string,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const nextList = currentCart(ctx).filter((b) => b.booksId !== matchedBook.id)
  ctx.setContext({ cartItems: nextList, shoppingList: nextList })

  return {
    ok: true,
    toolName: TOOL_NAME,
    message: `장바구니에서 "${displayTitle}"을 뺐어요.`,
    data: { shoppingList: toShoppingListData(nextList) },
  }
}

async function finishRemoveMany(
  entries: { booksId: string; title: string }[],
  displayTitle: string,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const ids = [...new Set(entries.map((e) => e.booksId))]
  const idSet = new Set(ids)
  const nextList = currentCart(ctx).filter((b) => !idSet.has(b.booksId))
  ctx.setContext({ cartItems: nextList, shoppingList: nextList })

  const n = ids.length
  return {
    ok: true,
    toolName: TOOL_NAME,
    message:
      n === 1
        ? `장바구니에서 "${displayTitle}"을 뺐어요.`
        : `장바구니에서 "${displayTitle}" ${n}권을 뺐어요.`,
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

type ResolvedBook = {
  recognized: BookRecognitionResult
  matchedBook: BookPreview
}

type ResolveBookOutcome =
  | { ok: true; resolved: ResolvedBook }
  | { ok: false; toolResult: ToolResult }

async function resolveBookFromRecognition(
  args: Record<string, unknown>,
  reason: 'add' | 'remove',
): Promise<ResolveBookOutcome> {
  const bridge = getBookRecognitionClient()
  const recognized = await bridge.identifyBook({
    reason,
    hintText: typeof args.hint === 'string' ? args.hint : undefined,
    imageBase64: typeof args.imageBase64 === 'string' ? args.imageBase64 : undefined,
  })
  if (!recognized.ok || !recognized.title) {
    const code = recognized.errorCode ?? 'BOOK_NOT_RECOGNIZED'
    const kind = classifyListFailure(code)
    const message =
      kind === 'match'
        ? '해당 책을 매장 DB에서 찾지 못했어요.'
        : kind === 'system'
          ? '지금은 표지 인식 연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.'
          : recognized.message
    return {
      ok: false,
      toolResult: { ok: false, toolName: TOOL_NAME, message, errorCode: code },
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
        message: `DB에서 "${recognized.title}"을 찾지 못했어요.`,
        errorCode: 'BOOK_NOT_IN_CATALOG',
      },
    }
  }

  return { ok: true, resolved: { recognized, matchedBook } }
}

async function handleAdd(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const imageBase64 = typeof args.imageBase64 === 'string' ? args.imageBase64.trim() : ''
  if (imageBase64) {
    const outcome = await resolveBookFromRecognition({ ...args, imageBase64 }, 'add')
    if (!outcome.ok) return outcome.toolResult
    const { recognized, matchedBook } = outcome.resolved
    return finishAddWithBook(matchedBook, recognized.title ?? matchedBook.title, ctx, recognized.isbn13)
  }

  const rawHint = typeof args.hint === 'string' ? args.hint : ''
  const hint = normalizeListHint(rawHint, 'add')
  if (!hint) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '담을 책 제목을 적어 주세요. 예: "책 추가 미움받을 용기"',
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
  if (catRes.data?.id) return finishAddWithBook(catRes.data, catRes.data.title || hint, ctx)

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
      message: `제목이 모호해요. 혹시 이 중 하나일까요? ${candidateTitlesLine(fuzzyRes.data.map((c) => c.book.title))}`,
      errorCode: 'BOOK_MATCH_AMBIGUOUS',
    }
  }

  if (shoppingListSkipRecognition()) return catalogMissResult()
  const outcome = await resolveBookFromRecognition(args, 'add')
  if (!outcome.ok) return outcome.toolResult
  const { recognized, matchedBook } = outcome.resolved
  return finishAddWithBook(matchedBook, recognized.title ?? matchedBook.title, ctx, recognized.isbn13)
}

async function handleRemove(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
  const imageBase64 = typeof args.imageBase64 === 'string' ? args.imageBase64.trim() : ''
  if (imageBase64) {
    const outcome = await resolveBookFromRecognition({ ...args, imageBase64 }, 'remove')
    if (!outcome.ok) return outcome.toolResult
    const { recognized, matchedBook } = outcome.resolved
    return finishRemoveWithBook(matchedBook, recognized.title ?? matchedBook.title, ctx)
  }

  const rawHint = typeof args.hint === 'string' ? args.hint : ''
  const hint = normalizeListHint(rawHint, 'remove')
  if (!hint) {
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: '뺄 책 제목을 적어 주세요. 예: "책 제거 미움받을 용기"',
      errorCode: 'HINT_EMPTY',
    }
  }

  const list = currentCart(ctx)
  const visMatches = matchShoppingListByTitleHint(list, hint)
  if (visMatches.length > 1) {
    const distinctTitles = new Set(visMatches.map((m) => m.title))
    if (distinctTitles.size > 1) {
      return {
        ok: false,
        toolName: TOOL_NAME,
        message: '장바구니에서 여러 권이 맞아요. 더 구체적인 제목을 적어 주세요.',
        errorCode: 'AMBIGUOUS_REMOVE',
      }
    }
    return finishRemoveMany(visMatches, visMatches[0]!.title, ctx)
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

  if (list.length > 0) {
    if (shoppingListSkipRecognition()) return listRemoveUnmatchedResult()
    const outcome = await resolveBookFromRecognition(args, 'remove')
    if (!outcome.ok) return outcome.toolResult
    const { recognized, matchedBook } = outcome.resolved
    return finishRemoveWithBook(matchedBook, recognized.title ?? matchedBook.title, ctx)
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
      message: '지원하지 않는 장바구니 액션이에요.',
      errorCode: 'INVALID_ACTION',
    }
  },
}
