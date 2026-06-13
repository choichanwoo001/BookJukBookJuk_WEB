import { useEffect, useState } from 'react'
import { AppMainShell } from './components/AppMainShell'
import BalanceGameGate from './components/BalanceGameGate'
import QrLoginGate from './components/QrLoginGate'
import SimilarReadersGate from './components/SimilarReadersGate'
import VisitChoiceGate from './components/VisitChoiceGate'
import LlmRequiredGate from './components/LlmRequiredGate'
import SessionStartGate from './components/SessionStartGate'
import { clearCurrentWebSession } from './lib/supabase/qrLogin'
import { demoRequiresLlm, isDemoMode, isLlmConfigured } from './config/demoMode'
import type { ShoppingListEntry } from './agent/types'
import type { OnboardingStep, TasteSeed } from './types/onboarding'
import './styles/layout.css'

function App() {
  const [usersId, setUsersId] = useState<string | null>(null)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('visit_choice')
  const [tasteSeed, setTasteSeed] = useState<TasteSeed | null>(null)
  const [plannedBooks, setPlannedBooks] = useState<ShoppingListEntry[]>([])
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
    setPlannedBooks([])
    setOnboardingStep('visit_choice')
  }

  const enterApp = () => {
    setOnboardingStep('app')
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
    return (
      <VisitChoiceGate
        onSelect={(nextVisitType) => {
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
          if (isDemoMode() && demoRequiresLlm() && !isLlmConfigured()) {
            setOnboardingStep('llm_required')
          } else {
            setOnboardingStep('similar_readers')
          }
        }}
      />
    )
  }

  if (onboardingStep === 'qr_login') {
    return (
      <QrLoginGate
        onLoggedIn={(nextUsersId) => {
          setUsersId(nextUsersId)
          if (isDemoMode() && demoRequiresLlm() && !isLlmConfigured()) {
            setOnboardingStep('llm_required')
          } else {
            setOnboardingStep('similar_readers')
          }
        }}
      />
    )
  }

  if (onboardingStep === 'llm_required') {
    return (
      <LlmRequiredGate
        onRetry={() => {
          setOnboardingStep(isLlmConfigured() ? 'similar_readers' : 'llm_required')
        }}
      />
    )
  }

  if (onboardingStep === 'session_start') {
    return (
      <SessionStartGate
        tasteSeed={tasteSeed}
        onStart={() => setOnboardingStep('app')}
      />
    )
  }

  if (onboardingStep === 'similar_readers') {
    return (
      <SimilarReadersGate
        tasteSeed={tasteSeed}
        plannedBooks={plannedBooks}
        onAddBooks={addPlannedBooks}
        onRemoveBooks={removePlannedBooks}
        onStart={() => {
          if (isDemoMode()) {
            setOnboardingStep('session_start')
          } else {
            enterApp()
          }
        }}
      />
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

export default App
