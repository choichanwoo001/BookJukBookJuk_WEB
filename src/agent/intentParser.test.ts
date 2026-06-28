import { describe, expect, it } from 'vitest'
import { parseIntent } from './intentParser'

describe('parseIntent', () => {
  it('parses cancel', () => {
    expect(parseIntent('취소', 'chat').type).toBe('cancel')
  })

  it('does not treat correction language as cancel', () => {
    expect(parseIntent('아니 내가 말한 건 기분이야', 'chat').type).not.toBe('cancel')
  })

  it('still parses explicit cancel language as cancel', () => {
    expect(parseIntent('아니, 취소할게', 'chat').type).toBe('cancel')
  })

  it('prioritizes pause over add when both match', () => {
    const i = parseIntent('멈춰', 'chat')
    expect(i.type).toBe('pause_mobility')
  })

  it('parses follow and lead robot intents', () => {
    expect(parseIntent('따라와', 'chat').type).toBe('follow_robot')
    expect(parseIntent('다시 리드', 'voice').type).toBe('lead_robot')
  })

  it('parses natural remove sentence without a leading book keyword', () => {
    const i = parseIntent('위시리스트에서 기초영어 빼줘', 'chat')
    expect(i.type).toBe('remove_book')
  })

  it('maps checkout language to checkout intent', () => {
    expect(parseIntent('큐레이션 종료하고 계산하러 가자', 'chat').type).toBe('checkout')
    expect(parseIntent('계산', 'chat').type).toBe('checkout')
  })

  it('maps cart and purchase language to add_book intent across sources', () => {
    expect(parseIntent('이 책 카트에 담아줘', 'gesture').type).toBe('add_book')
    expect(parseIntent('이 책 살게', 'voice').type).toBe('add_book')
  })
})
