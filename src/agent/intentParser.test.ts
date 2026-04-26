import { describe, expect, it } from 'vitest'
import { parseIntent } from './intentParser'

describe('parseIntent', () => {
  it('parses cancel', () => {
    expect(parseIntent('취소', 'chat').type).toBe('cancel')
  })

  it('extracts quantity for list_update_quantity', () => {
    const i = parseIntent('수량 3권으로 바꿔', 'chat')
    expect(i.type).toBe('list_update_quantity')
    expect(i.payload?.quantity).toBe(3)
  })

  it('prioritizes pause over add when both match', () => {
    const i = parseIntent('멈춰', 'chat')
    expect(i.type).toBe('pause_mobility')
  })
})
