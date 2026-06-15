import type { ReaderProfile, TasteSeed } from '../types/onboarding'
import { DEMO_BOOKS, demoRefCoverUrl } from './demoScenario'

export const defaultTasteSeed: TasteSeed = {
  tasteTags: ['문장', '관계', '잔잔함'],
  tone: '감성적인',
  pace: '천천히 음미하는',
  interest: '관계와 내면',
}

const demoBook1ReaderEntry = {
  id: 'demo-book1',
  title: DEMO_BOOKS.book1.title,
  author: DEMO_BOOKS.book1.authors,
  coverUrl: demoRefCoverUrl(DEMO_BOOKS.book1),
  rating: 4.5,
  reviewCount: 142,
  reason: '어른이란 무엇인지, 관계와 책임을 돌아보는 에세이가 취향과 잘 맞아요.',
}

const demoBook2ReaderEntry = {
  id: 'demo-book2',
  title: DEMO_BOOKS.book2.title,
  author: DEMO_BOOKS.book2.authors,
  coverUrl: demoRefCoverUrl(DEMO_BOOKS.book2),
  rating: 4.4,
  reviewCount: 118,
  reason: '두 사람의 만남과 이별을 따라가는 소설이 감정선과 잘 맞아요.',
}

const demoSerendipityReaderEntry = {
  id: 'demo-serendipity',
  title: DEMO_BOOKS.serendipity.title,
  author: DEMO_BOOKS.serendipity.authors,
  coverUrl: demoRefCoverUrl(DEMO_BOOKS.serendipity),
  rating: 4.6,
  reviewCount: 96,
  reason: '한 사람에게 집중하는 이야기. 잔잔하지만 깊은 여운이 남아요.',
}

const demoSummerReaderEntry = {
  id: 'demo-summer',
  title: DEMO_BOOKS.alternative.title,
  author: DEMO_BOOKS.alternative.authors,
  coverUrl: demoRefCoverUrl(DEMO_BOOKS.alternative),
  rating: 4.5,
  reviewCount: 87,
  reason: '여름과 관계, 상실과 회복을 담은 소설집이 취향과 잘 맞아요.',
}

const calmBooks = [
  demoBook2ReaderEntry,
  demoSerendipityReaderEntry,
  demoSummerReaderEntry,
  demoBook1ReaderEntry,
  {
    id: 'liked-1',
    title: '아주 희미한 빛으로도',
    author: '최은영',
    coverUrl: 'https://image.aladin.co.kr/product/32129/40/cover200/s672937436_1.jpg',
    rating: 4.6,
    reviewCount: 128,
    reason: '하이라이트한 문장들과 비슷하게 관계의 감정을 조용히 다루는 책이에요.',
  },
  {
    id: 'liked-2',
    title: '우리가 빛의 속도로 갈 수 없다면',
    author: '김초엽',
    coverUrl: 'https://image.aladin.co.kr/product/19359/16/cover200/s722039767_1.jpg',
    rating: 4.4,
    reviewCount: 96,
    reason: '상실과 미래에 대한 질문을 섬세하게 담아낸 이야기가 취향과 잘 맞아요.',
  },
  {
    id: 'liked-3',
    title: '말의 온도',
    author: '이기주',
    coverUrl: 'https://image.aladin.co.kr/product/10349/48/cover200/8997335871_2.jpg',
    rating: 4.5,
    reviewCount: 203,
    reason: '담담하지만 따뜻한 문장들이 당신이 좋아하는 분위기와 닮아 있어요.',
  },
  {
    id: 'liked-4',
    title: '모순',
    author: '양귀자',
    coverUrl: 'https://image.aladin.co.kr/product/2584/37/cover200/8998441012_3.jpg',
    rating: 4.3,
    reviewCount: 176,
    reason: '관계의 복잡한 감정을 깊이 있게 다루는 결이 비슷해요.',
  },
]

export const readerProfiles: ReaderProfile[] = [
  {
    id: 'reader-emotional-lines',
    name: '감성적인 문장에 오래 머무는 독자',
    avatarTone: 'sea',
    avatarUrl: '/reader-avatars/reader-emotional-lines.png',
    tagline: '문장을 오래 붙잡고 감정의 결을 따라 읽어요.',
    similarity: 87,
    tasteTags: ['문장', '관계', '잔잔함'],
    reasons: ['잔잔한 분위기의 소설을 자주 읽어요.', '하이라이트한 문장의 감정 톤이 비슷해요.'],
    description:
      '관계 중심의 소설과 조용한 에세이를 오래 읽는 독자예요. 빠른 전개보다 문장의 여운, 인물의 감정 변화, 읽고 난 뒤 남는 온도를 중요하게 봅니다.',
    likedBooks: calmBooks,
    readBooks: [
      {
        id: 'read-1',
        title: '쇼코의 미소',
        author: '최은영',
        coverUrl: 'https://image.aladin.co.kr/product/8679/95/cover200/8954641636_1.jpg',
        rating: 4.7,
        reviewCount: 142,
        reason: '인물 사이의 거리감과 회복의 감정이 취향 단서와 닮아 있어요.',
      },
      {
        id: 'read-2',
        title: '소년이 온다',
        author: '한강',
        coverUrl: 'https://image.aladin.co.kr/product/4086/97/cover200/8936434128_2.jpg',
        rating: 4.8,
        reviewCount: 221,
        reason: '아픈 감정을 외면하지 않고 끝까지 응시하는 독서 성향이 보여요.',
      },
      {
        id: 'read-3',
        title: '여행의 이유',
        author: '김영하',
        coverUrl: 'https://image.aladin.co.kr/product/33763/31/cover200/s332036339_1.jpg',
        rating: 4.2,
        reviewCount: 87,
        reason: '사유가 이어지는 문장과 개인적인 기억을 좋아하는 흐름과 맞아요.',
      },
    ],
  },
  {
    id: 'reader-growth-realistic',
    name: '현실적인 성장 서사를 좋아하는 독자',
    avatarTone: 'window',
    avatarUrl: '/reader-avatars/reader-growth-realistic.png',
    tagline: '무너진 일상에서 다시 방향을 찾는 이야기에 끌려요.',
    similarity: 82,
    tasteTags: ['성장', '현실', '자기발견'],
    reasons: ['성장 서사와 자기 발견 이야기를 좋아해요.', '인물 중심의 이야기에 몰입하는 패턴이 비슷해요.'],
    description:
      '현실적인 문제를 안고 있는 인물이 자기만의 속도로 변해가는 이야기에 강하게 반응합니다. 결말의 통쾌함보다 과정의 설득력을 더 중요하게 보는 독자예요.',
    likedBooks: [
      {
        id: 'liked-5',
        title: '불편한 편의점',
        author: '김호연',
        coverUrl: 'https://image.aladin.co.kr/product/29045/74/cover200/k192836746_2.jpg',
        rating: 4.2,
        reviewCount: 311,
        reason: '일상적인 공간에서 인물들이 조금씩 회복되는 흐름이 잘 맞아요.',
      },
      {
        id: 'liked-6',
        title: '어서 오세요, 휴남동 서점입니다',
        author: '황보름',
        coverUrl: 'https://image.aladin.co.kr/product/33783/53/cover200/k872930470_1.jpg',
        rating: 4.4,
        reviewCount: 154,
        reason: '책과 사람을 통해 삶의 리듬을 회복하는 분위기가 비슷해요.',
      },
      {
        id: 'liked-7',
        title: '나는 나로 살기로 했다',
        author: '김수현',
        coverUrl: 'https://image.aladin.co.kr/product/35516/57/cover200/k212036764_1.jpg',
        rating: 4.1,
        reviewCount: 192,
        reason: '자기 자신을 돌보는 태도를 다룬 문장이 취향에 가까워요.',
      },
    ],
    readBooks: [
      {
        id: 'read-4',
        title: '아몬드',
        author: '손원평',
        coverUrl: 'https://image.aladin.co.kr/product/31893/32/cover200/k212833749_2.jpg',
        rating: 4.5,
        reviewCount: 266,
        reason: '서툰 인물이 세상과 연결되는 성장감이 추천 기준에 맞아요.',
      },
      {
        id: 'read-5',
        title: '달러구트 꿈 백화점',
        author: '이미예',
        coverUrl: 'https://image.aladin.co.kr/product/24512/70/cover200/k392630952_2.jpg',
        rating: 4.0,
        reviewCount: 302,
        reason: '가볍게 읽히지만 마음을 건드리는 설정을 선호하는 흐름이에요.',
      },
    ],
  },
  {
    id: 'reader-quiet-comfort',
    name: '조용한 위로가 담긴 책을 찾는 독자',
    avatarTone: 'plant',
    avatarUrl: '/reader-avatars/reader-quiet-comfort.png',
    tagline: '큰 사건보다 작은 문장 하나에 안심하는 편이에요.',
    similarity: 78,
    tasteTags: ['위로', '에세이', '차분함'],
    reasons: ['위로와 치유의 메시지가 담긴 책을 선호해요.', '에세이와 산문을 자주 읽어요.'],
    description:
      '무리하게 긍정하지 않는 다정한 책을 좋아합니다. 조용한 문장, 생활의 감각, 스스로를 돌보게 하는 메시지를 오래 기억하는 독자예요.',
    likedBooks: [
      {
        id: 'liked-8',
        title: '나에게 고맙다',
        author: '전승환',
        coverUrl: 'https://image.aladin.co.kr/product/28926/90/cover200/k232836219_1.jpg',
        rating: 4.1,
        reviewCount: 78,
        reason: '스스로에게 건네는 다정한 문장들이 취향과 잘 맞아요.',
      },
      {
        id: 'liked-9',
        title: '죽고 싶지만 떡볶이는 먹고 싶어',
        author: '백세희',
        coverUrl: 'https://image.aladin.co.kr/product/15136/29/cover200/k962533360_2.jpg',
        rating: 4.0,
        reviewCount: 188,
        reason: '솔직한 감정과 회복의 속도가 비슷한 독서 결을 보여줘요.',
      },
      {
        id: 'liked-10',
        title: '언어의 온도',
        author: '이기주',
        coverUrl: 'https://image.aladin.co.kr/product/25260/11/cover200/k322633102_1.jpg',
        rating: 4.2,
        reviewCount: 239,
        reason: '일상에서 건져 올린 문장형 위로를 좋아하는 흐름이에요.',
      },
    ],
    readBooks: [
      {
        id: 'read-6',
        title: '모든 요일의 기록',
        author: '김민철',
        coverUrl: 'https://image.aladin.co.kr/product/38466/56/cover200/k872135918_1.jpg',
        rating: 4.3,
        reviewCount: 75,
        reason: '생활의 작은 감각을 놓치지 않는 독서 태도와 맞아요.',
      },
      {
        id: 'read-7',
        title: '아무튼, 식물',
        author: '임이랑',
        coverUrl: 'https://image.aladin.co.kr/product/18705/34/cover200/k842635872_1.jpg',
        rating: 4.0,
        reviewCount: 44,
        reason: '차분한 관찰과 담백한 애정을 좋아하는 성향이 드러나요.',
      },
    ],
  },
  {
    id: 'reader-questioning-worlds',
    name: '낯선 세계로 질문을 넓히는 독자',
    avatarTone: 'sky',
    avatarUrl: '/reader-avatars/reader-questioning-worlds.png',
    tagline: '새로운 설정 속에서 인간적인 질문을 찾는 걸 좋아해요.',
    similarity: 74,
    tasteTags: ['SF', '상상력', '질문'],
    reasons: ['세계관보다 인물의 감정을 더 중요하게 봐요.', '낯선 설정 안의 윤리적 질문에 반응해요.'],
    description:
      'SF와 환상적인 설정을 좋아하지만, 결국 마음에 남는 것은 사람의 선택과 관계라고 느끼는 독자입니다. 상상력과 감정선이 함께 있는 책을 선호해요.',
    likedBooks: [
      {
        id: 'liked-11',
        title: '천 개의 파랑',
        author: '천선란',
        coverUrl: 'https://image.aladin.co.kr/product/24895/69/cover200/k882632470_2.jpg',
        rating: 4.5,
        reviewCount: 118,
        reason: '기술적 상상력보다 다정한 관계를 중심에 두는 점이 잘 맞아요.',
      },
      {
        id: 'liked-12',
        title: '지구 끝의 온실',
        author: '김초엽',
        coverUrl: 'https://image.aladin.co.kr/product/27692/63/cover200/s222930473_1.jpg',
        rating: 4.4,
        reviewCount: 134,
        reason: '상실 이후의 회복을 상상력으로 풀어내는 결이 비슷해요.',
      },
      {
        id: 'liked-13',
        title: '우주섬 사비의 기묘한 탄도학',
        author: '배명훈',
        coverUrl: 'https://image.aladin.co.kr/product/29425/40/cover200/k482837326_1.jpg',
        rating: 4.0,
        reviewCount: 52,
        reason: '낯선 세계 속 인간적인 농담과 질문을 즐기는 흐름이에요.',
      },
    ],
    readBooks: [
      {
        id: 'read-8',
        title: '파견자들',
        author: '김초엽',
        coverUrl: 'https://image.aladin.co.kr/product/32591/29/cover200/k352935549_2.jpg',
        rating: 4.2,
        reviewCount: 61,
        reason: '타자를 이해하려는 시선이 추천 기준과 맞닿아 있어요.',
      },
      {
        id: 'read-9',
        title: '저주토끼',
        author: '정보라',
        coverUrl: 'https://image.aladin.co.kr/product/31484/34/cover200/k712832622_2.jpg',
        rating: 4.1,
        reviewCount: 95,
        reason: '기묘한 설정 아래 날카로운 감정을 읽어내는 성향이에요.',
      },
    ],
  },
]

export function rankReaderProfiles(seed: TasteSeed | null): ReaderProfile[] {
  if (!seed) return readerProfiles
  const seedTags = new Set(seed.tasteTags)
  return [...readerProfiles]
    .map((profile) => {
      const tagBonus = profile.tasteTags.filter((tag) => seedTags.has(tag)).length * 3
      const toneBonus = profile.tagline.includes(seed.tone.slice(0, 2)) ? 2 : 0
      return { profile, score: profile.similarity + tagBonus + toneBonus }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ profile, score }) => ({ ...profile, similarity: Math.min(96, score) }))
}
