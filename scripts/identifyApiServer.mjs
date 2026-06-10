#!/usr/bin/env node
/** 독립 실행용 (선택). 보통은 npm run dev 만으로 충분합니다. */
import { createServer } from 'node:http'
import { loadRefs, getRefCount, handleIdentifyRequest } from './identifyApiCore.mjs'

const HOST = process.env.IDENTIFY_API_HOST ?? '127.0.0.1'
const PORT = Number(process.env.IDENTIFY_API_PORT ?? 8787)

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res, status, body) {
  const { status: _drop, ...payload } = body
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

await loadRefs()

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, refs: getRefCount() })
    return
  }

  if (req.method !== 'POST' || req.url !== '/identify') {
    json(res, 404, { ok: false, message: 'not found', errorCode: 'NOT_FOUND' })
    return
  }

  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}')
    const result = await handleIdentifyRequest(body)
    json(res, result.status ?? 200, result)
  } catch (e) {
    console.error('[identify-api] error', e)
    json(res, 500, {
      ok: false,
      message: e instanceof Error ? e.message : 'server error',
      errorCode: 'SERVER_ERROR',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[identify-api] http://${HOST}:${PORT}/identify (refs ${getRefCount()}권)`)
})
