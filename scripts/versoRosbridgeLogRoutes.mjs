import { readBody, setCors } from './identifyProxyCore.mjs'
import {
  appendVersoLogEntry,
  clearVersoLogEntries,
  getVersoLogEntriesSince,
  getVersoLogSnapshot,
  parseVersoLogEntryBody,
} from './versoRosbridgeLogHub.mjs'

const TERMINAL_ROUTE = '/verso-rosbridge-log'
const ENTRY_ROUTE = '/verso-rosbridge-log/entry'
const ENTRIES_ROUTE = '/verso-rosbridge-log/entries'
const SNAPSHOT_ROUTE = '/verso-rosbridge-log/snapshot'
const CLEAR_ROUTE = '/verso-rosbridge-log/clear'
const MONITOR_ROUTE = '/verso-log'
const MONITOR_HTML_ROUTE = '/verso-log-monitor.html'

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** @param {import('connect').Connect.Server} serverMiddleware */
export function registerVersoRosbridgeLogRoutes(serverMiddleware) {
  serverMiddleware.use(async (req, res, next) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

    if (
      pathname !== TERMINAL_ROUTE &&
      pathname !== ENTRY_ROUTE &&
      pathname !== ENTRIES_ROUTE &&
      pathname !== SNAPSHOT_ROUTE &&
      pathname !== CLEAR_ROUTE &&
      pathname !== MONITOR_ROUTE
    ) {
      next()
      return
    }

    setCors(res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    if (pathname === MONITOR_ROUTE && req.method === 'GET') {
      res.statusCode = 302
      res.setHeader('Location', MONITOR_HTML_ROUTE)
      res.end()
      return
    }

    if (pathname === SNAPSHOT_ROUTE && req.method === 'GET') {
      writeJson(res, 200, getVersoLogSnapshot())
      return
    }

    if (pathname === ENTRIES_ROUTE && req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10)
      writeJson(res, 200, getVersoLogEntriesSince(Number.isFinite(since) ? since : 0))
      return
    }

    if (pathname === CLEAR_ROUTE && req.method === 'POST') {
      clearVersoLogEntries()
      res.statusCode = 204
      res.end()
      return
    }

    if (pathname === ENTRY_ROUTE && req.method === 'POST') {
      try {
        const raw = await readBody(req)
        const body = parseVersoLogEntryBody(JSON.parse(raw || '{}'))
        if (!body) {
          res.statusCode = 400
          res.end()
          return
        }
        appendVersoLogEntry(body)
        res.statusCode = 204
        res.end()
      } catch {
        res.statusCode = 400
        res.end()
      }
      return
    }

    if (pathname === TERMINAL_ROUTE && req.method === 'POST') {
      try {
        const raw = await readBody(req)
        const body = JSON.parse(raw || '{}')
        const level = body.level === 'error' || body.level === 'warn' ? body.level : 'info'
        const message = typeof body.message === 'string' ? body.message : String(body.message ?? '')

        if (level === 'error') console.error(message)
        else if (level === 'warn') console.warn(message)
        else console.log(message)

        res.statusCode = 204
        res.end()
      } catch {
        res.statusCode = 400
        res.end()
      }
      return
    }

    next()
  })
}
