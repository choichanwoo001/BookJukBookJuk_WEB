import { describe, expect, it } from 'vitest'
import { classifyListFailure } from './shoppingListTool'

describe('classifyListFailure', () => {
  it('classifies known match failures', () => {
    expect(classifyListFailure('BOOK_NOT_IN_CATALOG')).toBe('match')
    expect(classifyListFailure('BOOK_NOT_RECOGNIZED')).toBe('match')
  })

  it('classifies known system failures and 5xx http failures', () => {
    expect(classifyListFailure('HTTP_UNREACHABLE')).toBe('system')
    expect(classifyListFailure('HTTP_BAD_GATEWAY')).toBe('system')
    expect(classifyListFailure('HTTP_503')).toBe('system')
  })

  it('keeps unknown failures as other', () => {
    expect(classifyListFailure('UNKNOWN')).toBe('other')
    expect(classifyListFailure(undefined)).toBe('other')
  })
})
