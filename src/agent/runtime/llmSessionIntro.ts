import type { TasteSeed } from '../../types/onboarding'
import { callOpenAiResponses, llmFailureUserMessage } from './llmClient'

export async function generateSessionIntro(tasteSeed: TasteSeed | null): Promise<string | null> {
  const res = await callOpenAiResponses({
    system:
      '너는 서점 산책 로봇 산책이야. 한국어로 1~2문장만, 따뜻하게 입장을 환영한다. 이모지 없음.',
    user: JSON.stringify({
      tasteTags: tasteSeed?.tasteTags ?? [],
      tone: tasteSeed?.tone ?? '감성적인',
      pace: tasteSeed?.pace ?? '천천히',
      interest: tasteSeed?.interest ?? '관계',
    }),
    temperature: 0.5,
  })
  if (!res.ok) return llmFailureUserMessage(res.reason)
  return res.text
}
