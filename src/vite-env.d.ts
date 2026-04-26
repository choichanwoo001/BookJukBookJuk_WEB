/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * `http` (기본): `VITE_BOOK_RECOGNITION_API_BASE`의 `/identify`에 POST.
   * `window`만: `window.__BOOK_RECOGNITION_BRIDGE__`만 사용.
   * `http_only`: HTTP만 쓰고, 실패해도 `window`로는 넘기지 않음.
   */
  readonly VITE_BOOK_RECOGNITION_MODE?: 'http' | 'http_only' | 'window'
  /**
   * 기본: `/book-recognition` (Vite `server.proxy` → `127.0.0.1:8787`).
   * 절대 URL(예: `https://api.example.com`)이면 CORS/프로덕션에 맞게 설정.
   */
  readonly VITE_BOOK_RECOGNITION_API_BASE?: string
  /**
   * Supabase 프로젝트 URL (예: https://xxxx.supabase.co)
   */
  readonly VITE_SUPABASE_URL?: string
  /**
   * 브라우저에서 사용하는 Supabase publishable(anon) 키
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /**
   * 개발 단계에서 사용할 고정 사용자 ID
   */
  readonly VITE_APP_DEFAULT_USER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
