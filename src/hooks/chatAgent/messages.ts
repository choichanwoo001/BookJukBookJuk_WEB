export const CHAT_AGENT_MESSAGES = {
  confirmInput: '오케이',
  cancelInput: '취소',
  offTopic:
    '저는 서점 쇼핑 안내 도우미예요. 책 추천, 검색, 리스트 담기·삭제, 경로 안내, 계산대 이동을 도와드릴 수 있어요.',
  unknownFallback:
    '요청을 바로 실행하긴 어려워요. "추천해줘", "책 검색 데미안", "책 추가 데미안"처럼 말씀해 주시면 도와드릴게요.',
} as const

export function buildNavStartPrompt(bookCount: number): string {
  if (bookCount <= 0) {
    return '경로 보이게 해뒀어요. 시작하려면 "시작"이나 "오케이"라고 말해 주세요.'
  }
  return `책 ${bookCount}권 찾아뒀어요! 경로도 보이게 해뒀는데, 한번 보시고 시작하실 땐 "시작"이나 "오케이"라고 말해 주세요.`
}

