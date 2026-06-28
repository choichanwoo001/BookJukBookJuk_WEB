import { loadEnv } from 'vite'
import { registerKakaoPayRoutes } from './kakaoPayRoutes.mjs'
import { isKakaoPayConfigured } from './kakaoPayApiCore.mjs'

/** Vite dev: /kakao-pay/* 카카오페이 Ready·Approve·상태 조회 */
export function kakaoPayPlugin() {
  return {
    name: 'kakao-pay-dev',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('KAKAO_PAY_') && value) process.env[key] = value
      }

      registerKakaoPayRoutes(server.middlewares)
      console.log(`[kakao-pay] dev routes mounted (configured=${isKakaoPayConfigured()})`)
    },
  }
}
