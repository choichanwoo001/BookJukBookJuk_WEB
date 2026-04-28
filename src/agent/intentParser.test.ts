import { describe, expect, it } from 'vitest'
import { parseIntent } from './intentParser'

describe('parseIntent', () => {
  it('parses cancel', () => {
    expect(parseIntent('취소', 'chat').type).toBe('cancel')
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
