/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `npm run dev`에서 브라우저는 `fetch("/book-recognition/identify", …)` → 로컬 FastAPI(8787)
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
  server: {
    proxy: {
      '/book-recognition': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/book-recognition/, '') || '/',
      },
    },
  },
})
