import { describe, expect, it } from 'vitest'
import { mergePlannerIntentWithRules, requiresConfirmation } from './policy'
import type { AgentIntent } from './types'

function intent(type: AgentIntent['type'], confidence = 0.9): AgentIntent {
  return { type, source: 'chat', rawText: '', confidence, timestamp: Date.now() }
}

describe('requiresConfirmation', () => {
  it('returns false for cancel and confirm', () => {
    expect(requiresConfirmation(intent('cancel'))).toBe(false)
    expect(requiresConfirmation(intent('confirm'))).toBe(false)
  })

  it('requires confirmation for destructive intents', () => {
    expect(requiresConfirmation(intent('remove_book'))).toBe(true)
  })

  it('requires confirmation for low confidence', () => {
    expect(requiresConfirmation(intent('add_book', 0.5))).toBe(true)
  })
})

describe('mergePlannerIntentWithRules', () => {
  it('prefers rule-based remove_book over LLM recommendation', () => {
    const ruleIntent: AgentIntent = {
      type: 'remove_book',
      source: 'chat',
      rawText: '시원스쿨 기초영어법 삭제해줘',
      confidence: 0.9,
      timestamp: 1,
    }
    const merged = mergePlannerIntentWithRules({
      ruleIntent,
      llmPlan: { intentType: 'request_recommendation', confidence: 0.95 },
      rawTextForLlm: '시원스쿨 기초영어법 삭제해줘',
      source: 'chat',
      llmIntentType: 'request_recommendation',
      hasUsableLlmIntent: true,
    })
    expect(merged.type).toBe('remove_book')
    expect(merged.rawText).toBe('시원스쿨 기초영어법 삭제해줘')
  })

  it('uses LLM intent when rules did not match list edit', () => {
    const ruleIntent: AgentIntent = {
      type: 'request_recommendation',
      source: 'chat',
      rawText: '추천해줘',
      confidence: 0.74,
      timestamp: 1,
    }
    const merged = mergePlannerIntentWithRules({
      ruleIntent,
      llmPlan: { intentType: 'request_recommendation', confidence: 0.9 },
      rawTextForLlm: '추천해줘',
      source: 'chat',
      llmIntentType: 'request_recommendation',
      hasUsableLlmIntent: true,
    })
    expect(merged.type).toBe('request_recommendation')
    expect(merged.confidence).toBe(0.9)
  })

  it('falls back to rules when LLM is unusable', () => {
    const ruleIntent: AgentIntent = {
      type: 'search_books',
      source: 'chat',
      rawText: '책 검색 데미안',
      confidence: 0.82,
      timestamp: 1,
    }
    const merged = mergePlannerIntentWithRules({
      ruleIntent,
      llmPlan: null,
      rawTextForLlm: '책 검색 데미안',
      source: 'chat',
      llmIntentType: 'unknown',
      hasUsableLlmIntent: false,
    })
    expect(merged).toBe(ruleIntent)
  })

  it('prefers rule-based confirm over LLM remove_book', () => {
    const ruleIntent: AgentIntent = {
      type: 'confirm',
      source: 'chat',
      rawText: '오케이',
      confidence: 0.93,
      timestamp: 1,
    }
    const merged = mergePlannerIntentWithRules({
      ruleIntent,
      llmPlan: { intentType: 'remove_book', confidence: 0.9 },
      rawTextForLlm: '오케이',
      source: 'chat',
      llmIntentType: 'remove_book',
      hasUsableLlmIntent: true,
    })
    expect(merged.type).toBe('confirm')
  })
})
