import { useMemo, useState } from 'react'
import type { TasteSeed } from '../types/onboarding'

type BalanceChoice = {
  label: string
  description: string
  tags: string[]
  tone: string
  pace: string
  interest: string
}

type BalanceQuestion = {
  question: string
  choices: [BalanceChoice, BalanceChoice]
}

const questions: BalanceQuestion[] = [
  {
    question: '오늘 더 끌리는 책의 첫인상은?',
    choices: [
      {
        label: '문장이 오래 남는 책',
        description: '천천히 밑줄 긋고 싶은 문장이 좋아요.',
        tags: ['문장', '잔잔함'],
        tone: '감성적인',
        pace: '천천히 음미하는',
        interest: '관계와 내면',
      },
      {
        label: '이야기가 빠르게 당기는 책',
        description: '다음 장이 궁금해서 계속 읽게 되는 책이 좋아요.',
        tags: ['몰입', '전개'],
        tone: '선명한',
        pace: '빠르게 몰입하는',
        interest: '사건과 선택',
      },
    ],
  },
  {
    question: '책 속에서 더 오래 보고 싶은 것은?',
    choices: [
      {
        label: '사람 사이의 감정',
        description: '관계가 흔들리고 회복되는 장면에 마음이 가요.',
        tags: ['관계', '위로'],
        tone: '다정한',
        pace: '천천히 음미하는',
        interest: '관계와 내면',
      },
      {
        label: '새로운 세계와 질문',
        description: '낯선 설정 안에서 생각할 거리를 발견하고 싶어요.',
        tags: ['SF', '질문'],
        tone: '사유적인',
        pace: '빠르게 몰입하는',
        interest: '세계와 질문',
      },
    ],
  },
  {
    question: '읽고 난 뒤 남았으면 하는 감정은?',
    choices: [
      {
        label: '조용한 위로',
        description: '괜찮다고 말해주는 듯한 온기가 좋아요.',
        tags: ['위로', '에세이'],
        tone: '차분한',
        pace: '천천히 음미하는',
        interest: '회복과 생활',
      },
      {
        label: '현실적인 용기',
        description: '내 일상도 조금 바꿔볼 수 있을 것 같은 힘이 좋아요.',
        tags: ['성장', '현실'],
        tone: '현실적인',
        pace: '또렷하게 따라가는',
        interest: '성장과 자기발견',
      },
    ],
  },
  {
    question: '책을 고를 때 더 믿는 단서는?',
    choices: [
      {
        label: '좋아하는 작가와 문체',
        description: '이미 맞았던 문장의 결을 다시 찾는 편이에요.',
        tags: ['문장', '작가'],
        tone: '감성적인',
        pace: '천천히 음미하는',
        interest: '관계와 내면',
      },
      {
        label: '소재와 분위기의 새로움',
        description: '익숙하지 않은 조합에 먼저 호기심이 생겨요.',
        tags: ['상상력', '질문'],
        tone: '사유적인',
        pace: '빠르게 몰입하는',
        interest: '세계와 질문',
      },
    ],
  },
  {
    question: '지금 서점에서 한 권만 집는다면?',
    choices: [
      {
        label: '나를 돌보는 산문',
        description: '짧게 읽어도 마음이 정리되는 책을 고를래요.',
        tags: ['에세이', '차분함'],
        tone: '차분한',
        pace: '천천히 음미하는',
        interest: '회복과 생활',
      },
      {
        label: '인물이 변해가는 소설',
        description: '끝까지 따라가고 싶은 성장의 궤적을 고를래요.',
        tags: ['성장', '관계'],
        tone: '현실적인',
        pace: '또렷하게 따라가는',
        interest: '성장과 자기발견',
      },
    ],
  },
]

function summarizeSeed(answers: BalanceChoice[]): TasteSeed {
  const tagCounts = new Map<string, number>()
  const countField = (value: string, map: Map<string, number>) => {
    map.set(value, (map.get(value) ?? 0) + 1)
  }
  const toneCounts = new Map<string, number>()
  const paceCounts = new Map<string, number>()
  const interestCounts = new Map<string, number>()

  for (const answer of answers) {
    answer.tags.forEach((tag) => countField(tag, tagCounts))
    countField(answer.tone, toneCounts)
    countField(answer.pace, paceCounts)
    countField(answer.interest, interestCounts)
  }

  const top = (map: Map<string, number>, fallback: string) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback

  return {
    tasteTags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag),
    tone: top(toneCounts, '감성적인'),
    pace: top(paceCounts, '천천히 음미하는'),
    interest: top(interestCounts, '관계와 내면'),
  }
}

type BalanceGameGateProps = {
  onComplete: (tasteSeed: TasteSeed) => void
}

export default function BalanceGameGate({ onComplete }: BalanceGameGateProps) {
  const [answers, setAnswers] = useState<BalanceChoice[]>([])
  const question = questions[answers.length]
  const progress = useMemo(() => Math.round((answers.length / questions.length) * 100), [answers.length])

  const choose = (choice: BalanceChoice) => {
    const nextAnswers = [...answers, choice]
    if (nextAnswers.length >= questions.length) {
      onComplete(summarizeSeed(nextAnswers))
      return
    }
    setAnswers(nextAnswers)
  }

  return (
    <section className="onboardingShell balanceGate" aria-label="책 취향 밸런스 게임">
      <div className="balanceQuestionPane">
        <div className="balanceTop">
          <span>취향 밸런스 게임</span>
          <strong>
            {answers.length + 1} / {questions.length}
          </strong>
        </div>
        <div className="balanceProgress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
        <h1>{question.question}</h1>
      </div>
      <div className="balanceChoicesPane">
        <div className="balanceChoices">
          {question.choices.map((choice) => (
            <button key={choice.label} type="button" className="balanceChoice" onClick={() => choose(choice)}>
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
