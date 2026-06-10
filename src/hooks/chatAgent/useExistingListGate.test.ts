import { describe, expect, it } from 'vitest'
import type { ExistingListGateStatus } from './useExistingListGate'

describe('ExistingListGateStatus', () => {
  it('includes navigation gate states', () => {
    const statuses: ExistingListGateStatus[] = [
      'inactive',
      'awaiting',
      'confirmed',
      'awaiting_nav',
      'nav_started',
    ]
    expect(statuses).toHaveLength(5)
  })

  it('models awaiting_nav to nav_started transition', () => {
    let status: ExistingListGateStatus = 'awaiting_nav'
    status = 'nav_started'
    expect(status).toBe('nav_started')
  })
})
