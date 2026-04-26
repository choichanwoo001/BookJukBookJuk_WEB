import type { BookPreview } from '../../lib/supabase/books'
import { fetchLocationRecommendations, fetchRatingRecommendations } from '../../lib/supabase/books'
import type { DbResult } from '../../lib/supabase/result'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'
import type { RecommendationToolData, ToolResult } from '../types'
import { validateRecommendationArgs } from './toolValidators'
import type { ToolDefinition } from './types'

const TOOL_NAME = 'recommendationTool'

const NEARBY_FALLBACK = [
  '입구 근처: 이번 주 베스트셀러 코너',
  '중앙 서가: 평점 높은 인문 추천',
  '우측 통로: 장르 소설 인기 신간',
]

const RATING_FALLBACK = ['평점 4.7 이상 도서', '최근 리뷰 급상승 도서']

type RecommendationVariant = {
  fetch: (limit: number) => Promise<DbResult<BookPreview[]>>
  prefix: string
  successMessage: string
  fallbackMessage: string
  fallbackList: string[]
}

const VARIANTS: Record<string, RecommendationVariant> = {
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
    })
  }
  return okResult(variant.fallbackMessage, {
    recommendations: variant.fallbackList,
    source: 'fallback',
  })
}

export const recommendationTool: ToolDefinition = {
  name: TOOL_NAME,
  validate(args) {
    return validateRecommendationArgs(args)
  },
  async run(args) {
    const mode = typeof args.mode === 'string' ? args.mode : 'location'
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
