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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
