import type { GestureId } from './gestureClassifiers'

/**
 * 제스처 확정 시 채팅 에이전트에 전달할 텍스트.
 * null이면 패널 전용 동작(thumbs_up/down → 표지 인식)만 수행합니다.
 */
export function gestureToAgentInput(gestureId: GestureId): string | null {
  switch (gestureId) {
    case 'ok_sign':
      return '오케이'
    case 'stop':
      return '정지'
    case 'thumbs_up':
    case 'thumbs_down':
      return null
    default:
      return null
  }
}
