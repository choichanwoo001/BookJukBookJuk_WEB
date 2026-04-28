import { SUPABASE_NOT_CONFIGURED, SUPABASE_PERMISSION_DENIED } from './result'

/** User-facing copy when shelf list fetch fails. */
export function shelfListLoadUserMessage(errorCode?: string, message?: string): string {
  if (errorCode === SUPABASE_NOT_CONFIGURED) {
    return 'Supabase가 설정되지 않았어요. .env에 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.'
  }
  if (errorCode === SUPABASE_PERMISSION_DENIED) {
    return '리스트를 불러올 권한이 없어요. VITE_APP_DEFAULT_USER_ID와 DB의 RLS 정책을 확인해 주세요.'
  }
  if (message) return message
  return '리스트를 불러오지 못했어요.'
}
