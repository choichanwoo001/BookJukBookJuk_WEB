import type { AgentContext, AgentMessage } from '../types'
import { callOpenAiResponses } from './llmClient'

type Fetcher = typeof fetch

function toHistoryText(history: AgentMessage[]): string {
  return history
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')
}

const SYSTEM_PROMPT =
  '너는 북초북초 서점 쇼핑 안내 도우미다. 한국어로 1~3문장만 답한다.\n' +
  '- 책, 독서, 서점 이용, 쇼핑리스트, 이동 안내 관련 질문에 친절하고 구체적으로 답한다.\n' +
  '- 직접 실행 가능한 기능: 추천, 검색, 리스트 추가·삭제, 경로 안내, 멈춤·재개, 계산대 이동.\n' +
  '- 실행이 필요하면 "추천해줘", "책 검색 ○○"처럼 말해 달라고 짧게 안내한다.\n' +
  '- 없는 기능이나 확실하지 않은 정보는 지어내지 말고 솔직히 말한다.'

export async function generateConversationalReply(
  input: {
    text: string
    context: AgentContext
    history: AgentMessage[]
  },
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const cart = input.context.cartItems.length > 0 ? input.context.cartItems : input.context.shoppingList
  const res = await callOpenAiResponses(
    {
      system: SYSTEM_PROMPT,
      user: JSON.stringify({
        userText: input.text,
        context: {
          state: input.context.state,
          listType: input.context.listType,
          cartCount: cart.length,
          cartTitles: cart.slice(0, 5).map((b) => b.title),
          mobilityPaused: input.context.mobilityPaused,
        },
        history: toHistoryText(input.history),
      }),
      temperature: 0.55,
    },
    fetcher,
  )
  if (!res.ok) return null
  const text = res.text.trim()
  return text.length > 0 ? text : null
}
