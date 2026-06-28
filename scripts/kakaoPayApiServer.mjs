#!/usr/bin/env node
import { createServer } from 'node:http'
import { registerKakaoPayRoutes } from './kakaoPayRoutes.mjs'
import { isKakaoPayConfigured } from './kakaoPayApiCore.mjs'

const HOST = process.env.KAKAO_PAY_API_HOST ?? '127.0.0.1'
const PORT = Number(process.env.KAKAO_PAY_API_PORT ?? 8789)

const middlewares = []
registerKakaoPayRoutes({ use: (handler) => middlewares.push(handler) })

const server = createServer((req, res) => {
  let index = 0
  const next = () => {
    const handler = middlewares[index++]
    if (handler) {
      handler(req, res, next)
      return
    }
    res.statusCode = 404
    res.end('not found')
  }
  next()
})

server.listen(PORT, HOST, () => {
  console.log(`[kakao-pay] API http://${HOST}:${PORT} (configured=${isKakaoPayConfigured()})`)
})
