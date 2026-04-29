import { describe, expect, it } from 'vitest'
import { SUPABASE_NOT_CONFIGURED, SUPABASE_PERMISSION_DENIED } from './result'
import { shelfListLoadUserMessage } from './listLoadUi'

describe('shelfListLoadUserMessage', () => {
  it('mentions env vars when not configured', () => {
    const m = shelfListLoadUserMessage(SUPABASE_NOT_CONFIGURED)
    expect(m).toContain('VITE_SUPABASE_URL')
  })

  it('mentions RLS for permission denied', () => {
    const m = shelfListLoadUserMessage(SUPABASE_PERMISSION_DENIED)
    expect(m).toContain('RLS')
  })
})
