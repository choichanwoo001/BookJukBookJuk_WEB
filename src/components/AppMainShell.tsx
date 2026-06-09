import { lazy, Suspense, useCallback, useState } from 'react'
import ChatPanel from './ChatPanel'
import { useChatAgent } from '../hooks/useChatAgent'
import { GESTURE_LABELS_KO, type GestureId } from '../lib/gestureClassifiers'
import type { ShoppingListEntry } from '../agent/types'
import type { TasteSeed } from '../types/onboarding'

const Map3DView = lazy(() => import('./Map3DView'))

export type AppMainShellProps = {
  usersId: string | null
  plannedBooks: ShoppingListEntry[]
  tasteSeed: TasteSeed | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onResetOnboarding: () => void
}

export function AppMainShell({
  usersId,
  plannedBooks,
  tasteSeed,
  isFullscreen,
  onToggleFullscreen,
  onResetOnboarding,
}: AppMainShellProps) {
  const [activePane, setActivePane] = useState<'map' | 'chat'>('map')
  const agent = useChatAgent({ initialShoppingList: plannedBooks, tasteSeed })

  const { appendRecognitionMessage } = agent

  const handleVoiceRecognized = useCallback(
    (transcript: string) => {
      appendRecognitionMessage('voice', `🎤 음성 인식: "${transcript}"`)
    },
    [appendRecognitionMessage],
  )

  const handleGestureConfirmed = useCallback(
    (gestureId: GestureId) => {
      const label = GESTURE_LABELS_KO[gestureId]
      const actionHint =
        gestureId === 'thumbs_up'
          ? ' → 표지 인식 후 담기'
          : gestureId === 'thumbs_down'
            ? ' → 표지 인식 후 빼기'
            : ''
      appendRecognitionMessage('gesture', `✋ 제스처 확정: ${label}${actionHint}`)
    },
    [appendRecognitionMessage],
  )

  return (
    <main className="appShell">
      <section className="mapPane" onPointerDown={() => setActivePane('map')}>
        <Suspense fallback={<div className="map3DLoading" role="status">지도 불러오는 중...</div>}>
          <Map3DView
            activePane={activePane}
            onActivateMap={() => setActivePane('map')}
            busy={agent.busy}
            onBookCapture={agent.applyBookRecognitionCapture}
            onBookBrowse={agent.applyBookBrowseCapture}
            onGestureConfirmed={handleGestureConfirmed}
            usersId={usersId}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onResetOnboarding={onResetOnboarding}
          />
        </Suspense>
      </section>
      <aside className="chatPane" onPointerDown={() => setActivePane('chat')}>
        <ChatPanel
          activePane={activePane}
          onActivateChat={() => setActivePane('chat')}
          messages={agent.messages}
          submitUserText={agent.submitUserText}
          context={agent.context}
          busy={agent.busy}
          lastFailedUserText={agent.lastFailedUserText}
          acceptConfirmation={agent.acceptConfirmation}
          cancelConfirmation={agent.cancelConfirmation}
          retryLastFailed={agent.retryLastFailed}
          listLoadStatus={agent.listLoadStatus}
          listLoadMessage={agent.listLoadMessage}
          actionCard={agent.actionCard}
          onVoiceRecognized={handleVoiceRecognized}
        />
      </aside>
    </main>
  )
}
