import { useEffect, useState } from 'react'
import BalanceGameGate from './components/BalanceGameGate'
import ChatPanel from './components/ChatPanel'
import Map3DView from './components/Map3DView'
import QrLoginGate from './components/QrLoginGate'
import SimilarReadersGate from './components/SimilarReadersGate'
import VisitChoiceGate from './components/VisitChoiceGate'
import { clearCurrentWebSession } from './lib/supabase/qrLogin'
import type { OnboardingStep, TasteSeed, VisitType } from './types/onboarding'
import type { StartMode } from './types/startMode'
import './styles/layout.css'

function App() {
  const [activePane, setActivePane] = useState<'map' | 'chat'>('map')
  const [usersId, setUsersId] = useState<string | null>(null)
  const [startMode, setStartMode] = useState<StartMode>('browse_no_list')
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('visit_choice')
  const [visitType, setVisitType] = useState<VisitType | null>(null)
  const [tasteSeed, setTasteSeed] = useState<TasteSeed | null>(null)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenEnabled) return
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await document.documentElement.requestFullscreen()
    } catch (error) {
      console.warn('[fullscreen] toggle failed', error)
    }
  }

  const resetOnboarding = () => {
    clearCurrentWebSession()
    setUsersId(null)
    setTasteSeed(null)
    setVisitType(null)
    setStartMode('browse_no_list')
    setOnboardingStep('visit_choice')
  }

  const enterApp = () => {
    setStartMode(visitType === 'returning' ? 'existing_list' : 'browse_no_list')
    setOnboardingStep('app')
  }

  if (onboardingStep === 'visit_choice') {
    return (
      <VisitChoiceGate
        onSelect={(nextVisitType) => {
          setVisitType(nextVisitType)
          setOnboardingStep(nextVisitType === 'first' ? 'balance_game' : 'qr_login')
        }}
      />
    )
  }

  if (onboardingStep === 'balance_game') {
    return (
      <BalanceGameGate
        onComplete={(nextTasteSeed) => {
          setTasteSeed(nextTasteSeed)
          setUsersId('first-visit-guest')
          setOnboardingStep('similar_readers')
        }}
      />
    )
  }

  if (onboardingStep === 'qr_login') {
    return (
      <QrLoginGate
        onLoggedIn={(nextUsersId) => {
          setUsersId(nextUsersId)
          setOnboardingStep('similar_readers')
        }}
      />
    )
  }

  if (onboardingStep === 'similar_readers') {
    return <SimilarReadersGate tasteSeed={tasteSeed} usersId={usersId} onStart={enterApp} />
  }

  return (
    <main className="appShell">
      <div className="sessionBadge">
        <span>{usersId ? `사용자 ${usersId}` : '첫 방문 게스트'}</span>
        <button type="button" onClick={() => void toggleFullscreen()}>
          {isFullscreen ? '전체화면 종료' : '전체화면'}
        </button>
        <button type="button" onClick={resetOnboarding}>
          처음으로
        </button>
      </div>
      <section className="mapPane" onPointerDown={() => setActivePane('map')}>
        <Map3DView activePane={activePane} onActivateMap={() => setActivePane('map')} />
      </section>
      <aside className="chatPane" onPointerDown={() => setActivePane('chat')}>
        <ChatPanel activePane={activePane} onActivateChat={() => setActivePane('chat')} startMode={startMode} />
      </aside>
    </main>
  )
}

export default App
