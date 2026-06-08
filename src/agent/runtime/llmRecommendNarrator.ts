import type { TasteSeed } from '../../types/onboarding'
import { callOpenAiResponses, llmFailureUserMessage } from './llmClient'

export type RecommendNarratorBook = {
  title: string
  authors: string
  reason?: string
}

export async function generateRecommendNarrator(
  tasteSeed: TasteSeed | null,
  books: RecommendNarratorBook[],
): Promise<string | null> {
  const res = await callOpenAiResponses({
    system:
      '너는 서점 큐레이션 로봇이야. 사용자 취향에 맞춰 추천 목록을 소개한다. 한국어 2~3문장, 번호 목록은 붙이지 말고 자연스럽게 말한다.',
    user: JSON.stringify({
      tasteSeed,
      recommendations: books.map((b, i) => ({
        rank: i + 1,
        title: b.title,
        authors: b.authors,
        hint: b.reason,
      })),
    }),
    temperature: 0.45,
  })
  if (!res.ok) return llmFailureUserMessage(res.reason)
  return res.text
}
