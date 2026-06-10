import { describe, expect, it } from 'vitest'
import { isOffTopicUserMessage } from './offTopicClassifier'

describe('isOffTopicUserMessage', () => {
  it('flags clearly unrelated topics', () => {
    expect(isOffTopicUserMessage('오늘 날씨 어때?')).toBe(true)
    expect(isOffTopicUserMessage('주식 추천 좀 해줘')).toBe(true)
    expect(isOffTopicUserMessage('김치찌개 레시피 알려줘')).toBe(true)
  })

  it('allows book and store related messages', () => {
    expect(isOffTopicUserMessage('요즘 뭐 읽을 만해?')).toBe(false)
    expect(isOffTopicUserMessage('이 책 결말이 궁금해')).toBe(false)
    expect(isOffTopicUserMessage('쇼핑리스트에 담는 방법 알려줘')).toBe(false)
  })

  it('allows short greetings for conversational LLM', () => {
    expect(isOffTopicUserMessage('안녕')).toBe(false)
    expect(isOffTopicUserMessage('고마워')).toBe(false)
  })
})
