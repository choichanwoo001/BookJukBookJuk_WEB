/** @typedef {'incoming' | 'outgoing'} LogDirection */
/** @typedef {'status' | 'path' | 'event' | 'command' | 'waypoints' | 'connection' | 'mission'} LogKind */

/** @typedef {{
 *   id: number
 *   at: number
 *   direction: LogDirection
 *   kind: LogKind
 *   topic?: string
 *   summary: string
 *   detail?: string
 * }} LogEntry */

const MAX_ENTRIES = 800

/** @type {LogEntry[]} */
let entries = []
let nextId = 1

/**
 * @param {Omit<LogEntry, 'id'> & { id?: number }} entry
 * @returns {LogEntry}
 */
export function appendVersoLogEntry(entry) {
  const full = {
    id: typeof entry.id === 'number' ? entry.id : nextId++,
    at: typeof entry.at === 'number' ? entry.at : Date.now(),
    direction: entry.direction,
    kind: entry.kind,
    topic: entry.topic,
    summary: entry.summary,
    detail: entry.detail,
  }
  if (full.id >= nextId) nextId = full.id + 1
  entries.push(full)
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES)
  }
  return full
}

/** @param {number} since */
export function getVersoLogEntriesSince(since) {
  const filtered = entries.filter((entry) => entry.id > since)
  return {
    incoming: filtered.filter((entry) => entry.direction === 'incoming'),
    outgoing: filtered.filter((entry) => entry.direction === 'outgoing'),
    nextSince: entries.length ? entries[entries.length - 1].id : since,
  }
}

export function getVersoLogSnapshot() {
  const incoming = entries.filter((entry) => entry.direction === 'incoming')
  const outgoing = entries.filter((entry) => entry.direction === 'outgoing')
  return {
    incoming,
    outgoing,
    nextSince: entries.length ? entries[entries.length - 1].id : 0,
  }
}

export function clearVersoLogEntries() {
  entries = []
  nextId = 1
}

/** @param {unknown} value */
export function parseVersoLogEntryBody(value) {
  if (!value || typeof value !== 'object') return null
  const body = /** @type {Record<string, unknown>} */ (value)
  const direction = body.direction === 'outgoing' ? 'outgoing' : body.direction === 'incoming' ? 'incoming' : null
  const kind = typeof body.kind === 'string' ? body.kind : null
  const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
  if (!direction || !kind || !summary) return null
  return {
    direction,
    kind,
    topic: typeof body.topic === 'string' ? body.topic : undefined,
    summary,
    detail: typeof body.detail === 'string' ? body.detail : undefined,
    at: typeof body.at === 'number' ? body.at : undefined,
  }
}
