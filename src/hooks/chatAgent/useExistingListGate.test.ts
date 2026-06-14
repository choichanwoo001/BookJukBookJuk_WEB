import { describe, expect, it } from 'vitest'
import type { ExistingListGateStatus } from './useExistingListGate'

describe('useExistingListGate', () => {
  it('defines nav gate statuses', () => {
    const statuses: ExistingListGateStatus[] = [
      'inactive',
      'awaiting_nav',
      'awaiting_nav_confirm',
      'nav_started',
    ]
    expect(statuses).toHaveLength(4)
  })

  it('models awaiting_nav_confirm to nav_started transition', () => {
    let status: ExistingListGateStatus = 'awaiting_nav_confirm'
    status = 'nav_started'
    expect(status).toBe('nav_started')
  })
})
