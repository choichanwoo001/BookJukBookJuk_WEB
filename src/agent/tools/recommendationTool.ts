import type { BookPreview } from '../../lib/supabase/books'
import {
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
  fetch: (limit: number) => Promise<DbResult<BookPreview[]>>
  prefix: string
  successMessage: string
  fallbackMessage: string
  fallbackList: string[]
}

const VARIANTS: Record<Exclude<RecommendationMode, 'taste'>, RecommendationVariant> = {
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

function okResult(message: string, data: RecommendationToolData): ToolResult {
  return { ok: true, toolName: TOOL_NAME, message, data }
}

async function runRecommendationVariant(variant: RecommendationVariant): Promise<ToolResult> {
  const res = await variant.fetch(3)
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
    return okResult(variant.successMessage, {
      recommendations: formatRecommendations(variant.prefix, res.data),
      source: 'supabase',
      candidates: res.data.map((item) => ({ title: item.title, authors: item.authors || '저자 미상' })),
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

async function runTasteRecommendation(ctx: Parameters<ToolDefinition['run']>[1]): Promise<ToolResult> {
  const usersId = resolveUsersId(ctx)
  const res = await fetchTasteRecommendations(usersId, 3, 20)
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

  const prefix = res.data.source === 'taste' ? '취향 추천' : '보완 추천'
  const recommendations =
    res.data.books.length > 0 ? formatRecommendations(prefix, res.data.books) : TASTE_FALLBACK
  const successMessage =
    res.data.source === 'taste'
      ? '취향 기반 추천을 찾았어요.'
      : '취향 정보를 보완해 추천을 준비했어요.'

  return okResult(successMessage, {
    recommendations,
    source: res.data.source,
    candidates: res.data.books.map((item) => ({ title: item.title, authors: item.authors || '저자 미상' })),
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
    const mode: RecommendationMode = args.mode === 'location' || args.mode === 'rating' ? args.mode : 'taste'
    if (mode === 'taste') {
      return runTasteRecommendation(ctx)
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
    return runRecommendationVariant(variant)
  },
}
