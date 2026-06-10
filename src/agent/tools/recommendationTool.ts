import {
  type BookPreview,
  dedupeBookPreviewList,
  fetchLocationRecommendations,
  fetchRatingRecommendations,
  fetchTasteRecommendations,
} from '../../lib/supabase/books'
import type { DbResult } from '../../lib/supabase/result'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'
import type { RecommendationMode, RecommendationToolData, ToolResult } from '../types'
import { validateRecommendationArgs } from './toolValidators'
import type { ToolDefinition } from './types'
import { getDefaultUserId } from '../../lib/supabase/env'

const TOOL_NAME = 'recommendationTool'

const NEARBY_FALLBACK = [
  '입구 근처: 이번 주 베스트셀러 코너',
  '중앙 서가: 평점 높은 인문 추천',
  '우측 통로: 장르 소설 인기 신간',
]

const RATING_FALLBACK = ['평점 4.7 이상 도서', '최근 리뷰 급상승 도서']
const TASTE_FALLBACK = ['최근 취향 데이터가 부족해 인기 도서로 추천해드릴게요.']

type RecommendationVariant = {
  fetch: (limit: number, excludeBookIds?: readonly string[]) => Promise<DbResult<BookPreview[]>>
  prefix: string
  successMessage: string
  fallbackMessage: string
  fallbackList: string[]
}

const VARIANTS: Record<'location' | 'rating', RecommendationVariant> = {
  location: {
    fetch: fetchLocationRecommendations,
    prefix: '위치 추천',
    successMessage: '위치 기반 추천을 찾았어요.',
    fallbackMessage: '위치 기반 추천을 준비했어요.',
    fallbackList: NEARBY_FALLBACK,
  },
  rating: {
    fetch: fetchRatingRecommendations,
    prefix: '평점 추천',
    successMessage: '평점 기반 추천을 찾았어요.',
    fallbackMessage: '평점 기반 추천 확장을 준비했어요.',
    fallbackList: RATING_FALLBACK,
  },
}

function formatRecommendations(prefix: string, items: { title: string; authors: string }[]): string[] {
  return items.map((item, index) => `${prefix} ${index + 1}. ${item.title} - ${item.authors || '저자 미상'}`)
}

function mapCandidates(items: { id: string; title: string; authors: string; coverImageUrl?: string }[]) {
  return items.map((item) => ({
    booksId: item.id,
    title: item.title,
    authors: item.authors || '저자 미상',
    coverImageUrl: item.coverImageUrl ?? '',
  }))
}

function okResult(message: string, data: RecommendationToolData): ToolResult {
  return { ok: true, toolName: TOOL_NAME, message, data }
}

async function runRecommendationVariant(
  variant: RecommendationVariant,
  ctx: Parameters<ToolDefinition['run']>[1],
): Promise<ToolResult> {
  const excludeBookIds = recommendationExcludeIds(ctx)
  const res = await variant.fetch(3, excludeBookIds)
  if (!res.ok) {
    if (res.errorCode === SUPABASE_NOT_CONFIGURED) {
      return okResult(variant.fallbackMessage, {
        recommendations: variant.fallbackList,
        source: 'fallback',
      })
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: res.message ?? '추천 조회에 실패했어요.',
      errorCode: res.errorCode,
    }
  }
  if (res.data.length > 0) {
    const books = dedupeBookPreviewList(res.data)
    return okResult(variant.successMessage, {
      recommendations: formatRecommendations(variant.prefix, books),
      source: 'supabase',
      candidates: mapCandidates(books),
    })
  }
  return okResult(variant.fallbackMessage, {
    recommendations: variant.fallbackList,
    source: 'fallback',
  })
}

function resolveUsersId(ctx: Parameters<ToolDefinition['run']>[1]): string {
  const fromContext = ctx.getContext().activeUsersId
  if (typeof fromContext === 'string' && fromContext.trim().length > 0) return fromContext.trim()
  return getDefaultUserId()
}

function recommendationExcludeIds(ctx: Parameters<ToolDefinition['run']>[1]): string[] {
  const { cartItems, shoppingList, recentlyRecommendedBookIds } = ctx.getContext()
  const fromList = [...cartItems, ...shoppingList].map((b) => b.booksId).filter((id) => id.trim().length > 0)
  const recent = (recentlyRecommendedBookIds ?? []).filter((id) => id.trim().length > 0)
  return [...new Set([...fromList, ...recent])]
}

const TASTE_DIVERSITY_WINDOW = 15

async function runBookAlternativeRecommendation(
  args: Record<string, unknown>,
  ctx: Parameters<ToolDefinition['run']>[1],
): Promise<ToolResult> {
  const seedBookId = typeof args.seedBookId === 'string' ? args.seedBookId.trim() : ''
  const reason = typeof args.negativeReason === 'string' ? args.negativeReason.trim() : ''
  const excludeBookIds = [...recommendationExcludeIds(ctx), seedBookId].filter((id) => id.length > 0)
  const res = await fetchLocationRecommendations(3, excludeBookIds)
  if (!res.ok) {
    if (res.errorCode === SUPABASE_NOT_CONFIGURED) {
      return okResult('책 기준 보완 추천을 준비했어요.', {
        recommendations: [
          '보완 추천 1. 더 가벼운 분량의 책',
          '보완 추천 2. 같은 주제의 입문서',
          '보완 추천 3. 평점이 높은 대체 도서',
        ],
        source: 'fallback',
      })
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: res.message ?? '보완 추천 조회에 실패했어요.',
      errorCode: res.errorCode,
    }
  }
  const books = dedupeBookPreviewList(res.data)
  const prefix = reason ? `보완 추천(${reason.slice(0, 18)})` : '보완 추천'
  return okResult('방금 내려놓은 책 기준으로 대안을 골라봤어요.', {
    recommendations: books.length > 0 ? formatRecommendations(prefix, books) : ['보완 추천 1. 같은 주제의 다른 책'],
    source: 'supabase',
    candidates: mapCandidates(books),
  })
}

async function runTasteRecommendation(ctx: Parameters<ToolDefinition['run']>[1]): Promise<ToolResult> {
  const usersId = resolveUsersId(ctx)
  const excludeBookIds = recommendationExcludeIds(ctx)
  const diversityRound = ctx.getContext().recommendationDiversityRound ?? 0
  const res = await fetchTasteRecommendations(usersId, 3, 20, excludeBookIds, {
    windowSize: TASTE_DIVERSITY_WINDOW,
    round: diversityRound,
  })
  if (!res.ok) {
    if (res.errorCode === SUPABASE_NOT_CONFIGURED) {
      return okResult('취향 추천을 준비했어요.', {
        recommendations: TASTE_FALLBACK,
        source: 'fallback',
        tasteMeta: {
          richness: 0,
          computedAt: new Date(0).toISOString(),
          topGenres: [],
          topAuthors: [],
          reasons: ['Supabase 미설정으로 기본 추천을 사용했어요.'],
          profileStatus: 'none',
        },
      })
    }
    return {
      ok: false,
      toolName: TOOL_NAME,
      message: res.message ?? '취향 추천 조회에 실패했어요.',
      errorCode: res.errorCode,
    }
  }

  const books = dedupeBookPreviewList(res.data.books)
  const prefix = res.data.source === 'taste' ? '취향 추천' : '보완 추천'
  const recommendations = books.length > 0 ? formatRecommendations(prefix, books) : TASTE_FALLBACK
  const successMessage =
    res.data.source === 'taste'
      ? '취향 기반 추천을 찾았어요.'
      : '취향 정보를 보완해 추천을 준비했어요.'

  return okResult(successMessage, {
    recommendations,
    source: res.data.source,
    candidates: mapCandidates(books),
    tasteMeta: {
      richness: res.data.richness,
      computedAt: res.data.computedAt,
      topGenres: res.data.topGenres,
      topAuthors: res.data.topAuthors,
      reasons: res.data.reasons,
      profileStatus: res.data.profileStatus,
    },
  })
}

export const recommendationTool: ToolDefinition = {
  name: TOOL_NAME,
  validate(args) {
    return validateRecommendationArgs(args)
  },
  async run(args, ctx) {
    const mode: RecommendationMode =
      args.mode === 'location' || args.mode === 'rating' || args.mode === 'book_alternative'
        ? args.mode
        : 'taste'
    if (mode === 'taste') {
      return runTasteRecommendation(ctx)
    }
    if (mode === 'book_alternative') {
      return runBookAlternativeRecommendation(args, ctx)
    }
    const variant = VARIANTS[mode]
    if (!variant) {
      return {
        ok: false,
        toolName: TOOL_NAME,
        message: '알 수 없는 추천 모드입니다.',
        errorCode: 'INVALID_MODE',
      }
    }
    return runRecommendationVariant(variant, ctx)
  },
}
