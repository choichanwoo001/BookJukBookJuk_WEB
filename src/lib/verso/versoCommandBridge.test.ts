import { describe, expect, it } from 'vitest'
import {
  isVersoRobotSyncActive,
  registerVersoCommandBridge,
  tryPublishVersoCommand,
  tryPublishVersoWaypoints,
} from './versoCommandBridge'

describe('versoCommandBridge', () => {
  it('blocks publish when connected but robot sync is inactive', () => {
    registerVersoCommandBridge(
      'connected',
      false,
      () => true,
      () => true,
      () => true,
    )
    expect(isVersoRobotSyncActive()).toBe(false)
    expect(tryPublishVersoCommand('stop')).toBe(false)
    expect(tryPublishVersoWaypoints([{ id: 'book2', x: 1, y: 2 }])).toBe(false)
  })

  it('publishes when connected and robot sync is active', () => {
    let published = false
    registerVersoCommandBridge(
      'connected',
      true,
      () => {
        published = true
        return true
      },
      null,
      null,
    )
    expect(tryPublishVersoCommand('stop')).toBe(true)
    expect(published).toBe(true)
  })
})
