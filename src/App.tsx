import { useState, type ReactNode } from 'react'
import { AppMainShell } from './components/AppMainShell'
import { MapDevShell } from './components/MapDevShell'
import { isMapDevMode } from './config/mapDevMode'
import BalanceGameGate from './components/BalanceGameGate'
import TasteAnalysisGate from './components/TasteAnalysisGate'
import QrLoginGate from './components/QrLoginGate'
import SimilarReadersGate from './components/SimilarReadersGate'
import VisitChoiceGate from './components/VisitChoiceGate'
import LlmRequiredGate from './components/LlmRequiredGate'
import SessionStartGate from './components/SessionStartGate'
import OnboardingChrome from './components/OnboardingChrome'
import { clearCurrentWebSession } from './lib/supabase/qrLogin'
import { demoRequiresLlm, isDemoMode, isLlmConfigured } from './config/demoMode'
import { useFullscreen } from './hooks/useFullscreen'
import type { ShoppingListEntry } from './agent/types'
import type { OnboardingStep, TasteSeed } from './types/onboarding'
import './styles/layout.css'

function AppOnboardingShell() {
  const [usersId, setUsersId] = useState<string | null>(null)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('visit_choice')
  const [tasteSeed, setTasteSeed] = useState<TasteSeed | null>(null)
  const [plannedBooks, setPlannedBooks] = useState<ShoppingListEntry[]>([])
  const { isFullscreen, toggleFullscreen, fullscreenSupported } = useFullscreen()

  const wrapOnboarding = (content: ReactNode) => (
    <OnboardingChrome
      isFullscreen={isFullscreen}
      onToggleFullscreen={() => void toggleFullscreen()}
      fullscreenSupported={fullscreenSupported}
    >
      {content}
    </OnboardingChrome>
  )

  const resetOnboarding = () => {
    clearCurrentWebSession()
    setUsersId(null)
    setTasteSeed(null)
    setPlannedBooks([])
    setOnboardingStep('visit_choice')
  }

  const enterApp = () => {
    setOnboardingStep('app')
  }

  const enterSessionStart = () => {
    setOnboardingStep('session_start')
  }

  const addPlannedBooks = (books: ShoppingListEntry[]) => {
    setPlannedBooks((prev) => {
      const seen = new Set(prev.map((book) => book.booksId))
      const next = [...prev]
      for (const book of books) {
        if (seen.has(book.booksId)) continue
        seen.add(book.booksId)
        next.push(book)
      }
      return next
    })
  }

  const removePlannedBooks = (books: ShoppingListEntry[]) => {
    const removeIds = new Set(books.map((book) => book.booksId))
    setPlannedBooks((prev) => prev.filter((book) => !removeIds.has(book.booksId)))
  }

  if (onboardingStep === 'visit_choice') {
    return wrapOnboarding(
      <VisitChoiceGate
        onSelect={(nextVisitType) => {
          setOnboardingStep(nextVisitType === 'first' ? 'balance_game' : 'qr_login')
        }}
      />,
    )
  }

  const goToReaderRecommendations = () => {
    if (isDemoMode() && demoRequiresLlm() && !isLlmConfigured()) {
      setOnboardingStep('llm_required')
    } else {
      setOnboardingStep('similar_readers')
    }
  }

  if (onboardingStep === 'balance_game') {
    return wrapOnboarding(
      <BalanceGameGate
        onComplete={(nextTasteSeed) => {
          setTasteSeed(nextTasteSeed)
          setUsersId('first-visit-guest')
          setOnboardingStep('taste_analysis')
        }}
      />,
    )
  }

  if (onboardingStep === 'taste_analysis' && tasteSeed) {
    return wrapOnboarding(<TasteAnalysisGate onComplete={goToReaderRecommendations} />)
  }

  if (onboardingStep === 'qr_login') {
    return wrapOnboarding(
      <QrLoginGate
        onLoggedIn={(nextUsersId) => {
          setUsersId(nextUsersId)
          if (isDemoMode() && demoRequiresLlm() && !isLlmConfigured()) {
            setOnboardingStep('llm_required')
          } else {
            setOnboardingStep('similar_readers')
          }
        }}
      />,
    )
  }

  if (onboardingStep === 'llm_required') {
    return wrapOnboarding(
      <LlmRequiredGate
        onRetry={() => {
          setOnboardingStep(isLlmConfigured() ? 'similar_readers' : 'llm_required')
        }}
      />,
    )
  }

  if (onboardingStep === 'session_start') {
    return wrapOnboarding(
      <SessionStartGate
        tasteSeed={tasteSeed}
        onStart={enterApp}
      />,
    )
  }

  if (onboardingStep === 'similar_readers') {
    return wrapOnboarding(
      <SimilarReadersGate
        tasteSeed={tasteSeed}
        plannedBooks={plannedBooks}
        onAddBooks={addPlannedBooks}
        onRemoveBooks={removePlannedBooks}
        onStart={enterSessionStart}
      />,
    )
  }

  return (
    <AppMainShell
      usersId={usersId}
      plannedBooks={plannedBooks}
      tasteSeed={tasteSeed}
      isFullscreen={isFullscreen}
      onToggleFullscreen={() => void toggleFullscreen()}
      onResetOnboarding={resetOnboarding}
    />
  )
}

function App() {
  if (isMapDevMode()) {
    return <MapDevShell />
  }

  return <AppOnboardingShell />
}

export default App
