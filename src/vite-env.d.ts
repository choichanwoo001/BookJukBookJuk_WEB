/// <reference types="vite/client" />

interface ImportMetaEnv {
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
  /**
   * Verso rosbridge WebSocket URL (예: ws://192.168.0.10:9090)
   */
  readonly VITE_VERSO_ROSBRIDGE_URL?: string
  /**
   * book_recognition 클라이언트 모드: http | http_only | window
   */
  readonly VITE_BOOK_RECOGNITION_MODE?: string
  /**
   * book_recognition API base (예: /book-recognition)
   */
  readonly VITE_BOOK_RECOGNITION_API_BASE?: string
  /**
   * true면 shoppingListTool이 identify API fallback을 건너뜀
   */
  readonly VITE_SHOPPING_LIST_SKIP_RECOGNITION?: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_OPENAI_TIMEOUT_MS?: string
  readonly VITE_TTS_VOICE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
