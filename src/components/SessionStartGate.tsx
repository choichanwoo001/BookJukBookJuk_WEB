import { useEffect, useState } from 'react'
import type { TasteSeed } from '../types/onboarding'
import { generateSessionIntro } from '../agent/runtime/llmSessionIntro'
import OnboardingBrandHeader from './OnboardingBrandHeader'

/** Intro stays visible briefly before auto-entering the map. */
const SESSION_INTRO_AUTO_ADVANCE_MS = 2800

type SessionStartGateProps = {
  tasteSeed: TasteSeed | null
  onStart: () => void
}

export default function SessionStartGate({ tasteSeed, onStart }: SessionStartGateProps) {
  const [intro, setIntro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    const run = async () => {
      setLoading(true)
      const text = await generateSessionIntro(tasteSeed)
      if (!disposed) {
        setIntro(text)
        setLoading(false)
      }
    }
    void run()
    return () => {
      disposed = true
    }
  }, [tasteSeed])

  useEffect(() => {
    if (loading || !intro) return undefined

    const timerId = window.setTimeout(() => {
      onStart()
    }, SESSION_INTRO_AUTO_ADVANCE_MS)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [intro, loading, onStart])

  return (
    <section className="onboardingShell sessionStartGate" aria-label="세션 시작">
      <OnboardingBrandHeader tagline="산책과 함께 독서 여정을 시작해요">
        {loading ? (
          <p>로봇이 인사를 준비하고 있어요…</p>
        ) : (
          <p className="sessionIntroText">{intro}</p>
        )}
      </OnboardingBrandHeader>
    </section>
  )
}
