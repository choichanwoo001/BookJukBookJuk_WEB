const BOOK_RELATED_PATTERN =
  /책|도서|서점|북|작가|저자|추천|검색|리스트|장바구니|쇼핑|읽|출판|소설|에세이|만화|경로|안내|로봇|이동|계산|구매|표지|취향|장르|베스트|신간|문학|문장|스토리|플롯|결말|서재|독서|낭독|시리즈|번역|출간|페이지|권수|권\b|필사|독후|리뷰|평점|베스트셀러|신작|고전|시\b|수필|자기계발|경영|역사|과학|철학|심리|힐링|기분|우울|슬픔|지루|심심|재미|스릴러|로맨스|판타지|SF|미스터리|공포|시간\s*없|뭐\s*읽|읽을\s*만|볼\s*만|담아|넣어|빼|삭제|제거|멈춰|진행|계산하러|데모|북초/i

const OFF_TOPIC_PATTERN =
  /날씨|기온|비\s*올|주식|비트코인|암호화폐|환율|금리|축구|야구|농구|e스포츠|롤\b|배그|요리|레시피|맛집|다이어트|칼로리|연예인|아이돌|정치|대선|선거|대통령|국회|의원|프로그래밍\s*오류|파이썬\s*에러|자바스크립트\s*버그|수학\s*문제|영어\s*번역해|한국어\s*번역해|월급|연봉|세금|병원|약\s*추천|증상|감기|코로나|여행\s*일정|항공권|호텔\s*예약|넷플릭스|유튜브\s*추천|드라마\s*추천|영화\s*추천(?!\s*책)|노래\s*추천|음악\s*추천/i

const CONVERSATIONAL_GREETING_PATTERN =
  /^(안녕|하이|헬로|반가워|고마워|감사|땡큐|thanks|thank\s*you|hello|hi)\b/i

/** 서점·독서 맥락과 무관한 잡담인지 판별 (명확한 경우만 true). */
export function isOffTopicUserMessage(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (OFF_TOPIC_PATTERN.test(trimmed)) return true
  if (BOOK_RELATED_PATTERN.test(trimmed)) return false
  if (CONVERSATIONAL_GREETING_PATTERN.test(trimmed)) return false
  return false
}
