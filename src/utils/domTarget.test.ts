import { describe, expect, it } from 'vitest'
import { isEditableDomTarget } from './domTarget'

describe('isEditableDomTarget', () => {
  it('matches form controls and content-editable elements', () => {
    expect(isEditableDomTarget(document.createElement('input'))).toBe(true)
    expect(isEditableDomTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableDomTarget(document.createElement('select'))).toBe(true)

    const editableByAttribute = document.createElement('div')
    editableByAttribute.setAttribute('contenteditable', 'true')
    expect(isEditableDomTarget(editableByAttribute)).toBe(true)

    const editableByProperty = document.createElement('div')
    Object.defineProperty(editableByProperty, 'isContentEditable', {
      configurable: true,
      value: true,
    })
    expect(isEditableDomTarget(editableByProperty)).toBe(true)
  })

  it('ignores non-editable elements and null targets', () => {
    expect(isEditableDomTarget(document.createElement('div'))).toBe(false)
    expect(isEditableDomTarget(null)).toBe(false)
  })
})
