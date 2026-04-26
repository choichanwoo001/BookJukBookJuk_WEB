import type { ToolDefinition } from './types'
import { validateFallbackArgs } from './toolValidators'

export const fallbackTool: ToolDefinition = {
  name: 'fallbackTool',
  validate(args) {
    return validateFallbackArgs(args)
  },
  async run(args) {
    const reason = typeof args.reason === 'string' ? args.reason : 'UNKNOWN'
    if (reason === 'SUPABASE_NOT_CONFIGURED') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: 'Supabase 연결 정보가 없어 로컬 모드로 동작 중이에요. .env 값을 확인해 주세요.',
      }
    }
    if (reason === 'SUPABASE_PERMISSION_DENIED') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: 'DB 권한이 없어 요청을 완료하지 못했어요. RLS 정책을 확인해 주세요.',
      }
    }
    if (reason === 'SUPABASE_QUERY_FAILED') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: 'DB 조회 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.',
      }
    }
    if (reason === 'BOOK_NOT_RECOGNIZED') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: '책 인식이 불안정해요. 책 제목을 채팅으로 입력해 주세요.',
      }
    }
    if (reason === 'BRIDGE_TIMEOUT' || reason === 'HTTP_UNREACHABLE') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: '인식 서버 응답이 느려요. 잠시 후 다시 시도하거나, 책 제목을 채팅으로 직접 입력해 주세요.',
      }
    }
    if (reason === 'BOOK_NOT_IN_CATALOG') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: 'DB에 해당 도서가 없어요. 다른 키워드로 검색해 보세요.',
      }
    }
    if (reason === 'ROUTE_FAILED') {
      return {
        ok: true,
        toolName: 'fallbackTool',
        message: '경로 계산이 실패했어요. 최단경로 재시도를 진행할까요?',
      }
    }
    return {
      ok: true,
      toolName: 'fallbackTool',
      message: '요청을 처리하는 중 문제가 발생했어요. 다시 시도해 주세요.',
    }
  },
}
