export const CHAT_AGENT_MESSAGES = {
  confirmInput: '오케이',
  cancelInput: '취소',
  offTopic:
    '저는 서점 쇼핑 안내 도우미예요. 책 추천, 검색, 리스트 담기·삭제, 경로 안내, 계산대 이동을 도와드릴 수 있어요.',
  unknownFallback:
    '요청을 바로 실행하긴 어려워요. "추천해줘", "책 검색 데미안", "책 추가 데미안"처럼 말씀해 주시면 도와드릴게요.',
} as const

export const CHAT_NAV_START_GUIDE = {
  title: '경로를 확인해 보세요',
  text: '경로를 보고 시작하고 싶을 때 "시작" 또는 "오케이"라고 말해 주세요.',
  examples: ['시작', '오케이'] as const,
} as const

export function buildNavStartPrompt(bookCount: number): string {
  if (bookCount <= 0) return CHAT_NAV_START_GUIDE.text
  return `책 ${bookCount}권이 준비됐어요. ${CHAT_NAV_START_GUIDE.text}`
}
