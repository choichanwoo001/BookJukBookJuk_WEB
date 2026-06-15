import { afterEach, describe, expect, it } from 'vitest'
import {
  appendVersoLogEntry,
  clearVersoLogEntries,
  getVersoLogEntriesSince,
  getVersoLogSnapshot,
  parseVersoLogEntryBody,
} from './versoRosbridgeLogHub.mjs'

describe('versoRosbridgeLogHub', () => {
  afterEach(() => {
    clearVersoLogEntries()
  })

  it('stores incoming and outgoing entries separately in snapshot', () => {
    appendVersoLogEntry({
      direction: 'incoming',
      kind: 'status',
      topic: '/verso/status',
      summary: 'pos (1,2)',
      at: 1000,
    })
    appendVersoLogEntry({
      direction: 'outgoing',
      kind: 'command',
      topic: '/verso/command',
      summary: 'stop',
      at: 1001,
    })

    const snap = getVersoLogSnapshot()
    expect(snap.incoming).toHaveLength(1)
    expect(snap.outgoing).toHaveLength(1)
    expect(snap.nextSince).toBe(2)
  })

  it('returns only entries after since id', () => {
    appendVersoLogEntry({
      direction: 'incoming',
      kind: 'status',
      summary: 'first',
      at: 1,
    })
    appendVersoLogEntry({
      direction: 'incoming',
      kind: 'status',
      summary: 'second',
      at: 2,
    })

    const delta = getVersoLogEntriesSince(1)
    expect(delta.incoming).toHaveLength(1)
    expect(delta.incoming[0]?.summary).toBe('second')
    expect(delta.nextSince).toBe(2)
  })

  it('validates entry body shape', () => {
    expect(
      parseVersoLogEntryBody({
        direction: 'incoming',
        kind: 'status',
        summary: 'ok',
      }),
    ).toMatchObject({ kind: 'status' })
    expect(parseVersoLogEntryBody({ direction: 'bad', kind: 'status', summary: 'x' })).toBeNull()
    expect(parseVersoLogEntryBody({ direction: 'incoming', kind: 'status', summary: '' })).toBeNull()
  })
})
