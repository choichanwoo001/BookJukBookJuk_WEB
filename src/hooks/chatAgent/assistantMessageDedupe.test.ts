import { describe, expect, it } from 'vitest'
import { isRedundantFallbackAssistantText } from './assistantMessageDedupe'

describe('isRedundantFallbackAssistantText', () => {
  it('detects identical strings', () => {
    const m = '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.'
    expect(isRedundantFallbackAssistantText(m, m)).toBe(true)
  })

  it('detects duplicate bridge/HTTP guidance', () => {
    const a = 'HTTP identify 서버에 연결할 수 없어요. uvicorn이 127.0.0.1:8787에서 실행 중인지 확인하세요.'
    const b = '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.'
    expect(isRedundantFallbackAssistantText(a, b)).toBe(false)
    const tool = '지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요.'
    expect(isRedundantFallbackAssistantText(tool, b)).toBe(true)
  })

  it('detects duplicate ambiguous-title guidance', () => {
    const a = '제목이 모호해요. 혹시 이 중 하나인가요? 1. 시원스쿨 기초영어법'
    const b = '입력한 제목이 여러 책과 비슷해요. 제목을 조금 더 길게 입력하거나 번호로 선택해 주세요.'
    expect(isRedundantFallbackAssistantText(a, b)).toBe(true)
  })

  it('treats punctuation-only variants as redundant', () => {
    const a = '해당 책은 서점에 없습니다.'
    const b = '해당 책은 서점에 없습니다'
    expect(isRedundantFallbackAssistantText(a, b)).toBe(true)
  })

  it('treats short fallback as redundant when its tokens are contained in a longer primary', () => {
    const primary =
      '죄송해요. 해당 책은 서점에 없습니다. 다른 제목으로 검색하거나 직원에게 문의해 주세요.'
    const fallback = '해당 책은 서점에 없습니다.'
    expect(isRedundantFallbackAssistantText(primary, fallback)).toBe(true)
  })

  it('does not merge distinct failure explanations', () => {
    const primary = '현재 리스트에서 해당 책을 찾지 못했어요. 제목을 확인해 주세요.'
    const fallback = '해당 책은 서점에 없습니다.'
    expect(isRedundantFallbackAssistantText(primary, fallback)).toBe(false)
  })
})
