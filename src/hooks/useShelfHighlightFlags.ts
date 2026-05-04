import { useMemo } from 'react'
import type { ShelfHighlightFlagsMap, ShelfHighlightKind } from '../data/shelfHighlights'

/**
 * Phase A: 선반(`shelf_id`)별 추천/하이라이트 종류. 백엔드 없이 3D 호버 UX 검증용 목 데이터.
 *
 * Phase B (후속, DB 준비 후): 예시 RPC 계약
 * - 이름: `get_shelf_highlight_flags` (또는 동등 뷰 + 클라이언트 집계)
 * - 인자: `p_user_id uuid default auth.uid()` (비로그인이면 anon 전역 플래그만 등)
 * - 반환: `jsonb` — `{ "shelf_001": ["wishlist","hot"], ... }` (`ShelfHighlightKind` 문자열 배열)
 * - 집계: `books.shelf_id` 기준으로 해당 선반에 조건을 만족하는 책이 하나라도 있으면 키에 종류 포함
 * - 필요 테이블(제품 정의 후): 찜, 리뷰/별점, 팔로우, HOT 지표, 취향/추천 점수 등
 */
const MOCK_SHELF_HIGHLIGHTS: Readonly<Record<string, readonly ShelfHighlightKind[]>> = {
  shelf_001: ['wishlist', 'hot'],
  shelf_005: ['highRating', 'tasteMatch'],
  shelf_010: ['socialProof'],
  shelf_015: ['wishlist', 'highRating', 'socialProof'],
}

function toFlagsMap(
  record: Readonly<Record<string, readonly ShelfHighlightKind[]>>,
): ShelfHighlightFlagsMap {
  const m = new Map<string, ReadonlySet<ShelfHighlightKind>>()
  for (const [shelfId, kinds] of Object.entries(record)) {
    m.set(shelfId, new Set(kinds))
  }
  return m
}

export function useShelfHighlightFlags(): ShelfHighlightFlagsMap {
  return useMemo(() => toFlagsMap(MOCK_SHELF_HIGHLIGHTS), [])
}
