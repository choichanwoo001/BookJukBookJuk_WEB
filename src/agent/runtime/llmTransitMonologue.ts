import type { DemoStep } from '../../data/demoScenario'
import { callOpenAiResponses, llmFailureUserMessage } from './llmClient'

export type TransitMonologueInput = {
  title: string
  authors: string
  description?: string
  demoStep: DemoStep
  legIndex: number
}

export async function generateTransitMonologue(input: TransitMonologueInput): Promise<string | null> {
  const res = await callOpenAiResponses({
    system:
      '너는 서점에서 함께 걷는 큐레이션 로봇이야. 이동 중 책에 대해 1~2문장으로 말한다. 스포일러 금지, 한국어.',
    user: JSON.stringify(input),
    temperature: 0.5,
  })
  if (!res.ok) return llmFailureUserMessage(res.reason)
  return res.text
}
