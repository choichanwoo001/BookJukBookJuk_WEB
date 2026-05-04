import { describe, expect, it } from 'vitest'
import { parseIntent } from './intentParser'

describe('parseIntent', () => {
  it('parses cancel', () => {
    expect(parseIntent('취소', 'chat').type).toBe('cancel')
  })

  it('does not treat correction "아니 … 기분" as cancel', () => {
    expect(parseIntent('아니 내가 말한 건 기분이야', 'chat').type).not.toBe('cancel')
  })

  it('still parses 아니 취소 as cancel', () => {
    expect(parseIntent('아니, 취소할게', 'chat').type).toBe('cancel')
  })

  it('prioritizes pause over add when both match', () => {
    const i = parseIntent('멈춰', 'chat')
    expect(i.type).toBe('pause_mobility')
  })

  it('parses natural remove sentence without leading 책 keyword', () => {
    const i = parseIntent('시원스쿨 기초영어법 리스트에서 삭제해줘', 'chat')
    expect(i.type).toBe('remove_book')
  })
})
