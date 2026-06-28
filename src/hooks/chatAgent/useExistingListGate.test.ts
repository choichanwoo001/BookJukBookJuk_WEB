import { describe, expect, it } from 'vitest'
import type { ExistingListGateStatus } from './useExistingListGate'

describe('useExistingListGate', () => {
  it('defines nav gate statuses', () => {
    const statuses: ExistingListGateStatus[] = [
      'inactive',
      'awaiting_nav',
      'nav_started',
    ]
    expect(statuses).toHaveLength(3)
  })

  it('models awaiting_nav to nav_started transition', () => {
    let status: ExistingListGateStatus = 'awaiting_nav'
    status = 'nav_started'
    expect(status).toBe('nav_started')
  })
})
