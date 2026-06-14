import { useEffect, useState } from 'react'
import OnboardingBrandHeader from './OnboardingBrandHeader'

const STEPS = [
  { message: '취향 답변을 정리하고 있어요…', durationMs: 900 },
  { message: '비슷한 문장 결을 가진 독자를 찾고 있어요…', durationMs: 1100 },
  { message: '추천 목록을 준비하고 있어요…', durationMs: 900 },
] as const

const MIN_TOTAL_MS = 2800

type TasteAnalysisGateProps = {
  onComplete: () => void
}

export default function TasteAnalysisGate({ onComplete }: TasteAnalysisGateProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(8)

  useEffect(() => {
    let disposed = false
    const startedAt = Date.now()

    const run = async () => {
      for (let index = 0; index < STEPS.length; index += 1) {
        if (disposed) return
        setStepIndex(index)
        setProgress(Math.round(((index + 0.35) / STEPS.length) * 100))
        await new Promise((resolve) => window.setTimeout(resolve, STEPS[index].durationMs))
        if (disposed) return
        setProgress(Math.round(((index + 1) / STEPS.length) * 100))
      }

      const elapsed = Date.now() - startedAt
      if (elapsed < MIN_TOTAL_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, MIN_TOTAL_MS - elapsed))
      }

      if (!disposed) onComplete()
    }

    void run()
    return () => {
      disposed = true
    }
  }, [onComplete])

  const currentMessage = STEPS[stepIndex]?.message ?? STEPS[STEPS.length - 1].message

  return (
    <section className="onboardingShell tasteAnalysisGate" aria-label="취향 분석" aria-busy="true">
      <OnboardingBrandHeader tagline="당신의 취향을 읽고 있어요">
        <div className="tasteAnalysisBody">
          <p className="tasteAnalysisMessage" role="status" aria-live="polite">
            {currentMessage}
          </p>

          <div className="tasteAnalysisProgress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </OnboardingBrandHeader>
    </section>
  )
}
