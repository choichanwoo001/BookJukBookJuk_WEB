/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error Vite plugin (ESM)
import { bookIdentifyPlugin } from './scripts/viteBookIdentifyPlugin.mjs'
// @ts-expect-error Vite plugin (ESM)
import { kakaoPayPlugin } from './scripts/viteKakaoPayPlugin.mjs'
// @ts-expect-error Vite plugin (ESM)
import { versoRosbridgeLogPlugin } from './scripts/viteVersoRosbridgeLogPlugin.mjs'

// https://vite.dev/config/
// `npm run dev` — /book-recognition/identify 는 Vite 미들웨어에서 처리 (별도 8787 불필요)
export default defineConfig({
  plugins: [react(), bookIdentifyPlugin(), kakaoPayPlugin(), versoRosbridgeLogPlugin()],
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
    pool: 'threads',
    maxWorkers: 2,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return
          if (id.includes('/node_modules/three/')) {
            return 'three-core'
          }
          if (id.includes('/node_modules/@react-three/') || id.includes('/node_modules/@use-gesture/')) {
            return 'r3f-vendor'
          }
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'react-vendor'
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'supabase-vendor'
          }
        },
      },
    },
  },
})
