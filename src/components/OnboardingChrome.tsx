import type { ReactNode } from 'react'
import FullscreenToggleButton from './FullscreenToggleButton'

type OnboardingChromeProps = {
  children: ReactNode
  isFullscreen: boolean
  onToggleFullscreen: () => void
  fullscreenSupported: boolean
}

export default function OnboardingChrome({
  children,
  isFullscreen,
  onToggleFullscreen,
  fullscreenSupported,
}: OnboardingChromeProps) {
  return (
    <div className="onboardingChrome">
      {fullscreenSupported && (
        <FullscreenToggleButton
          className="onboardingFullscreenToggle appButton appButton-ghost"
          isFullscreen={isFullscreen}
          onToggle={onToggleFullscreen}
        />
      )}
      {children}
    </div>
  )
}
