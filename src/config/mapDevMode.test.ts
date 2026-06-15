import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMapDevMode } from './mapDevMode'

describe('isMapDevMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns true when VITE_MAP_DEV is true', () => {
    vi.stubEnv('VITE_MAP_DEV', 'true')
    expect(isMapDevMode()).toBe(true)
  })

  it('returns true when mapOnly=1 is in the URL', () => {
    vi.stubEnv('VITE_MAP_DEV', '')
    vi.stubGlobal('window', {
      location: { search: '?mapOnly=1' },
    } as Window & typeof globalThis)
    expect(isMapDevMode()).toBe(true)
  })

  it('returns false when neither env nor query param is set', () => {
    vi.stubEnv('VITE_MAP_DEV', '')
    vi.stubGlobal('window', {
      location: { search: '' },
    } as Window & typeof globalThis)
    expect(isMapDevMode()).toBe(false)
  })
})
