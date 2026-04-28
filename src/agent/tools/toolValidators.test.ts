import { describe, expect, it } from 'vitest'
import { validateShoppingListArgs } from './toolValidators'

describe('validateShoppingListArgs', () => {
  it('accepts delete alias for remove action', () => {
    const error = validateShoppingListArgs({ action: 'delete', hint: '데미안' })
    expect(error).toBeNull()
  })

  it('returns guidance message for unsupported action', () => {
    const error = validateShoppingListArgs({ action: 'drop', hint: '데미안' })
    expect(error).toContain('add/remove')
  })
})
