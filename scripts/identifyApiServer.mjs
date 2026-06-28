#!/usr/bin/env node
/** Standalone proxy. It uses the same Python ORB API as the Vite dev route. */
import { createServer } from 'node:http'
import { loadRefs, getRefCount } from './identifyApiCore.mjs'
import { PYTHON_ORB_UNAVAILABLE, createPythonApiClient, readBody, sendJson, setCors } from './identifyProxyCore.mjs'

const HOST = process.env.IDENTIFY_API_HOST ?? '127.0.0.1'
const PORT = Number(process.env.IDENTIFY_API_PORT ?? 8787)
const PY_HOST = process.env.BOOK_RECOGNITION_PY_HOST ?? '127.0.0.1'
const PY_PORT = Number(process.env.BOOK_RECOGNITION_PY_PORT ?? 8788)

const pythonApi = createPythonApiClient({
  host: PY_HOST,
  port: PY_PORT,
  stdio: 'inherit',
  killOnProcessExit: true,
})

await loadRefs()
const pythonReady = await pythonApi.ensure()

const server = createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, refs: getRefCount(), pythonReady })
    return
  }

  if (req.method !== 'POST' || req.url !== '/identify') {
    sendJson(res, 404, { ok: false, message: 'not found', errorCode: 'NOT_FOUND' })
    return
  }

  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}')
    if (!pythonReady) {
      sendJson(res, 502, PYTHON_ORB_UNAVAILABLE)
      return
    }
    const result = await pythonApi.proxyIdentify(body)
    sendJson(res, result.status, result.payload)
  } catch (e) {
    console.error('[identify-api] error', e)
    sendJson(res, 500, {
      ok: false,
      message: e instanceof Error ? e.message : 'server error',
      errorCode: 'SERVER_ERROR',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[identify-api] http://${HOST}:${PORT}/identify -> ${pythonApi.baseUrl}/identify (refs ${getRefCount()}권)`)
})
