import type { VisitType } from '../types/onboarding'
import OnboardingBrandHeader from './OnboardingBrandHeader'

type VisitChoiceGateProps = {
  onSelect: (visitType: VisitType) => void
}

export default function VisitChoiceGate({ onSelect }: VisitChoiceGateProps) {
  return (
    <section className="onboardingShell visitChoiceGate" aria-label="방문 유형 선택">
      <OnboardingBrandHeader tagline="오늘의 독서 취향을 먼저 맞춰볼게요." />
      <div className="visitChoiceGrid">
        <button type="button" className="visitChoiceCard" onClick={() => onSelect('first')}>
          <span className="visitChoiceIcon" aria-hidden>
            ?
          </span>
          <strong>첫 방문이에요</strong>
          <span>책 취향 밸런스 게임으로 나와 비슷한 독자를 찾아요.</span>
        </button>
        <button type="button" className="visitChoiceCard" onClick={() => onSelect('returning')}>
          <span className="visitChoiceIcon" aria-hidden>
            QR
          </span>
          <strong>다시 방문했어요</strong>
          <span>QR 로그인으로 기존 독서 기록과 취향 데이터를 불러와요.</span>
        </button>
      </div>
    </section>
  )
}
