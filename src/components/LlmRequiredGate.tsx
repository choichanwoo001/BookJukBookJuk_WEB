import { isDemoMode, isLlmConfigured } from '../config/demoMode'

type LlmRequiredGateProps = {
  onRetry: () => void
  onSkip?: () => void
}

export default function LlmRequiredGate({ onRetry, onSkip }: LlmRequiredGateProps) {
  return (
    <section className="onboardingShell llmRequiredGate" aria-label="OpenAI API 설정 필요">
      <header className="onboardingIntro">
        <p className="onboardingEyebrow">Demo mode</p>
        <h1>OpenAI API 키가 필요해요</h1>
        <p>
          시연 모드에서는 대화·추천·음성(TTS)이 실제 OpenAI API를 사용합니다. 프로젝트 루트의{' '}
          <code>.env.local</code>에 <code>VITE_OPENAI_API_KEY</code>를 설정한 뒤 개발 서버를 다시 시작해 주세요.
        </p>
      </header>
      <div className="visitChoiceGrid">
        <button type="button" className="onboardingCtaPrimary" onClick={onRetry}>
          다시 확인
        </button>
        {onSkip && !isDemoMode() && (
          <button type="button" className="visitChoiceCard" onClick={onSkip}>
            API 없이 계속 (비추천)
          </button>
        )}
      </div>
      <p className="onboardingHint">현재 키 상태: {isLlmConfigured() ? '감지됨' : '없음'}</p>
    </section>
  )
}
