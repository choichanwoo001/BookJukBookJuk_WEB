import { cpSync, createReadStream, existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRefs, getRefCount } from './identifyApiCore.mjs'
import { PYTHON_ORB_UNAVAILABLE, createPythonApiClient, readBody, sendJson, setCors } from './identifyProxyCore.mjs'

const REFS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'book_recognition', 'refs')
const ROOT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PYTHON_API_HOST = process.env.BOOK_RECOGNITION_PY_HOST ?? '127.0.0.1'
const PYTHON_API_PORT = Number(process.env.BOOK_RECOGNITION_PY_PORT ?? 8787)
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

const REF_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function sendRefCover(res, fileName) {
  const safeName = basename(fileName)
  if (safeName !== fileName) {
    res.statusCode = 400
    res.end('bad request')
    return false
  }
  const filePath = join(REFS_DIR, safeName)
  if (!existsSync(filePath)) {
    res.statusCode = 404
    res.end('not found')
    return false
  }
  const contentType = REF_CONTENT_TYPES[extname(safeName).toLowerCase()] ?? 'application/octet-stream'
  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  createReadStream(filePath).pipe(res)
  return true
}

function createVitePythonApi(server) {
  return createPythonApiClient({
    host: PYTHON_API_HOST,
    port: PYTHON_API_PORT,
    cwd: ROOT_DIR,
    disabled: IS_TEST,
    stdio: ['ignore', 'pipe', 'pipe'],
    onStdout: () => {},
    onStderr: () => {},
    onExit: (code, signal) => {
      if (code || signal) {
        server.config.logger.warn(`[book-identify] Python ORB API 종료됨(code=${code}, signal=${signal})`)
      }
    },
    onReadyExisting: () => {},
    onReadyStarted: (_baseUrl, child) => {
      server.httpServer?.once('close', () => child.kill())
    },
    onStartFailed: () => {
      server.config.logger.warn(
        '[book-identify] Python ORB API를 시작하지 못했습니다. `pip install -r book_recognition/requirements.txt` 후 다시 실행하세요.',
      )
    },
  })
}

/** Vite dev: /book-recognition/identify 요청을 Python ORB API로 프록시합니다. */
export function bookIdentifyPlugin() {
  return {
    name: 'book-identify-dev',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist'
      const targetDir = join(outDir, 'book-recognition', 'refs')
      cpSync(REFS_DIR, targetDir, { recursive: true })
    },
    async configureServer(server) {
      await loadRefs()

      const pythonApi = createVitePythonApi(server)
      let pythonReady = await pythonApi.ensure()

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (!pathname.startsWith('/book-recognition')) {
          next()
          return
        }

        const sub = pathname.replace(/^\/book-recognition/, '') || '/'
        setCors(res)

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        try {
          if (req.method === 'GET' && sub === '/health') {
            sendJson(res, 200, { ok: true, refs: getRefCount() })
            return
          }

          if (req.method === 'GET' && sub.startsWith('/refs/')) {
            const fileName = decodeURIComponent(sub.slice('/refs/'.length))
            if (sendRefCover(res, fileName)) return
            return
          }

          if (req.method === 'POST' && sub === '/identify') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}')
            if (!pythonReady) pythonReady = await pythonApi.ensure()
            if (!pythonReady) {
              sendJson(res, 502, PYTHON_ORB_UNAVAILABLE)
              return
            }
            const result = await pythonApi.proxyIdentify(body)
            sendJson(res, result.status, result.payload)
            return
          }

          sendJson(res, 404, { ok: false, message: 'not found', errorCode: 'NOT_FOUND' })
        } catch (e) {
          console.error('[book-identify] error', e)
          sendJson(res, 500, {
            ok: false,
            message: e instanceof Error ? e.message : 'server error',
            errorCode: 'SERVER_ERROR',
          })
        }
      })
    },
  }
}
