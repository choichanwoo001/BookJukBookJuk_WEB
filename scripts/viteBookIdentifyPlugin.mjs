import { cpSync, createReadStream, existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRefs, getRefCount, handleIdentifyRequest } from './identifyApiCore.mjs'

const REFS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'book_recognition', 'refs')

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  const { status: _drop, ...payload } = body
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/** Vite dev: /book-recognition/* 를 별도 포트 없이 처리 */
export function bookIdentifyPlugin() {
  return {
    name: 'book-identify-dev',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist'
      const targetDir = join(outDir, 'book-recognition', 'refs')
      cpSync(REFS_DIR, targetDir, { recursive: true })
    },
    async configureServer(server) {
      const refs = await loadRefs()
      console.log(`[book-identify] refs ${refs.length}권 로드 (npm run dev 내장)`)
      for (const r of refs) {
        console.log(`  - ${r.file} → "${r.query}"`)
      }

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
            const result = await handleIdentifyRequest(body)
            const status = result.status ?? 200
            sendJson(res, status, result)
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
