import { lazy, Suspense, useCallback, useEffect, useState } from 'react'

import ChatPanel from './ChatPanel'

import { useChatAgent } from '../hooks/useChatAgent'

import { useVoiceCommandLoop } from '../hooks/useVoiceCommandLoop'

import { gestureToAgentInput } from '../lib/gestureAgentInput'

import { GESTURE_LABELS_KO, type GestureId } from '../lib/gestureClassifiers'

import {
  publishVersoEscort,
  publishVersoGuidance,
  publishVersoStop,
} from '../lib/verso/versoMobilityCommands'

import type { ShoppingListEntry } from '../agent/types'

import type { TasteSeed } from '../types/onboarding'

import { subscribeMapCommand } from '../agent/runtime/agentEventBus'

import { isDemoMode } from '../config/demoMode'

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



  useEffect(() => {

    return subscribeMapCommand((command) => {

      if (command.type === 'PREVIEW_NAV_PLAN' || command.type === 'START_NAVIGATION') {

        setActivePane('map')

      }

    })

  }, [])



  const { appendRecognitionMessage, submitAgentInput } = agent



  const handleVoiceUtterance = useCallback(

    (transcript: string) => {

      appendRecognitionMessage('voice', `🎤 "${transcript}"`)

      void submitAgentInput(transcript, 'voice')

    },

    [appendRecognitionMessage, submitAgentInput],

  )



  const voice = useVoiceCommandLoop({

    onUtteranceComplete: handleVoiceUtterance,

    paused: agent.busy || agent.ttsSpeaking,

  })



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



      // Mobility gestures: publish set_mode directly (bypasses agent - LLM has no set_mode tool)

      if (gestureId === 'follow_me') {
        if (isDemoMode() && agent.handleFollowMeDetour()) {
          return
        }
        publishVersoGuidance()
        return
      }

      if (gestureId === 'lead_again') {
        publishVersoEscort()
        return
      }

      if (gestureId === 'stop') {
        publishVersoStop()
        return
      }

      const agentText = gestureToAgentInput(gestureId)

      if (agentText) {

        void submitAgentInput(agentText, 'gesture')

      }

    },

    [appendRecognitionMessage, submitAgentInput, agent],

  )



  return (

    <main className="appShell">

      <section className="mapPane" onPointerDown={() => setActivePane('map')}>

        <Suspense fallback={<div className="map3DLoading" role="status">지도 불러오는 중...</div>}>

          <Map3DView

            activePane={activePane}

            onActivateMap={() => setActivePane('map')}

            busy={agent.busy}

            ttsSpeaking={agent.ttsSpeaking}

            mobilityHold={agent.mobilityHold}

            onBookCapture={agent.applyBookRecognitionCapture}

            onBookGestureDecision={agent.applyBookGestureDecision}

            onBookBrowse={agent.applyBookBrowseCapture}

            onGestureConfirmed={handleGestureConfirmed}

            usersId={usersId}

            isFullscreen={isFullscreen}

            onToggleFullscreen={onToggleFullscreen}

            onResetOnboarding={onResetOnboarding}

            voicePhase={voice.phase}

            voiceLivePreview={voice.livePreview}

            voiceSupported={voice.isSupported}

            voicePermissionDenied={voice.permissionDenied}

            voiceArmRemainingMs={voice.armRemainingMs}

            voiceMicOn={voice.isMicOn}

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

          ttsSpeaking={agent.ttsSpeaking}

          voicePhase={voice.phase}

          voiceLivePreview={voice.livePreview}

          voiceSupported={voice.isSupported}

          voicePermissionDenied={voice.permissionDenied}

          voiceArmRemainingMs={voice.armRemainingMs}

          voiceMicOn={voice.isMicOn}

          onToggleVoiceMic={voice.toggleMic}

          onStartKakaoPayCheckout={() => void agent.startKakaoPayCheckout()}

          onConfirmKakaoPayCheckout={() => void agent.confirmKakaoPayCheckout()}

          onCancelKakaoPayCheckout={agent.cancelKakaoPayCheckout}

        />

      </aside>

    </main>

  )

}


