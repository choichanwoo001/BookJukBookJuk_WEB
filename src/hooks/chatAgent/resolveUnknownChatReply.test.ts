import { describe, expect, it, vi } from 'vitest'
import { CHAT_AGENT_MESSAGES } from './messages'
import { resolveUnknownChatReply } from './resolveUnknownChatReply'

vi.mock('../../agent/runtime/llmChatReply', () => ({
  generateConversationalReply: vi.fn(),
}))

import { generateConversationalReply } from '../../agent/runtime/llmChatReply'

const baseContext = {
  state: 'INIT' as const,
  mobilityPaused: false,
  listType: '쇼핑리스트',
  shoppingList: [],
  cartItems: [],
  pendingDwellBook: null,
  awaitingDwellFeedback: false,
  checkoutStatus: 'idle' as const,
  receipt: null,
  recentlyRecommendedBookIds: [],
  recommendationDiversityRound: 0,
  pendingConfirmation: null,
  lastToolResult: null,
}

describe('resolveUnknownChatReply', () => {
  it('returns fixed reply for off-topic input', async () => {
    const result = await resolveUnknownChatReply({
      text: '오늘 날씨 어때?',
      llmPlan: null,
      context: baseContext,
      history: [],
    })
    expect(result.kind).toBe('off_topic')
    expect(result.text).toBe(CHAT_AGENT_MESSAGES.offTopic)
    expect(result.usedLlm).toBe(false)
  })

  it('prefers planner assistantDraft for conversational input', async () => {
    const result = await resolveUnknownChatReply({
      text: '서점 이용법 알려줘',
      llmPlan: {
        intentType: 'unknown',
        toolCall: null,
        assistantDraft: '추천이나 검색을 말씀해 주시면 바로 도와드릴게요.',
        confidence: 0.7,
        needsConfirmation: false,
      },
      context: baseContext,
      history: [],
    })
    expect(result.kind).toBe('conversational')
    expect(result.text).toContain('추천')
    expect(result.usedLlm).toBe(true)
    expect(generateConversationalReply).not.toHaveBeenCalled()
  })

  it('falls back to conversational LLM when no planner draft', async () => {
    vi.mocked(generateConversationalReply).mockResolvedValueOnce('독서는 취향에 맞게 고르시면 좋아요.')
    const result = await resolveUnknownChatReply({
      text: '독서 습관 어떻게 들이면 좋을까?',
      llmPlan: null,
      context: baseContext,
      history: [],
    })
    expect(result.kind).toBe('conversational')
    expect(result.text).toContain('독서')
    expect(result.usedLlm).toBe(true)
  })
})
