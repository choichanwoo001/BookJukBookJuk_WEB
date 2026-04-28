import { searchBooksByTitle } from '../../lib/supabase/books'
import { SUPABASE_NOT_CONFIGURED } from '../../lib/supabase/result'
import type { BookSearchToolData } from '../types'
import { validateBookSearchArgs } from './toolValidators'
import type { ToolDefinition } from './types'

const TOOL_NAME = 'bookSearchTool'

export const bookSearchTool: ToolDefinition = {
  name: TOOL_NAME,
  validate(args) {
    return validateBookSearchArgs(args)
  },
  async run(args) {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const limit = typeof args.limit === 'number' ? args.limit : 5
    if (!query) {
      return {
        ok: false,
        toolName: TOOL_NAME,
        message: '검색할 책 제목을 알려 주세요.',
        errorCode: 'EMPTY_QUERY',
      }
    }

    const res = await searchBooksByTitle(query, limit)
    if (!res.ok) {
      if (res.errorCode === SUPABASE_NOT_CONFIGURED) {
        return {
          ok: false,
          toolName: TOOL_NAME,
          message: 'Supabase가 설정되지 않아 검색할 수 없어요.',
          errorCode: res.errorCode,
        }
      }
      return {
        ok: false,
        toolName: TOOL_NAME,
        message: res.message ?? '도서 검색에 실패했어요.',
        errorCode: res.errorCode,
      }
    }

    const books = res.data.map((book) => ({ title: book.title, authors: book.authors }))
    if (books.length === 0) {
      return {
        ok: true,
        toolName: TOOL_NAME,
        message: `"${query}" 검색 결과가 없어요. 다른 키워드로 찾아볼까요?`,
        data: { books: [], query, source: 'supabase' },
      }
    }

    const data: BookSearchToolData = { books, query, source: 'supabase' }
    return {
      ok: true,
      toolName: TOOL_NAME,
      message: `"${query}" 검색 결과예요. 원하는 제목을 말하면 리스트에 담아 드려요.`,
      data,
    }
  },
}
