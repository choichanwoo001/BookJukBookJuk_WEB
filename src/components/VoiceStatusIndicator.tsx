import type { VoiceCommandPhase } from '../hooks/useVoiceCommandLoop'

export type VoiceStatusIndicatorProps = {
  phase: VoiceCommandPhase
  livePreview: string
  isSupported: boolean
  permissionDenied: boolean
  busy: boolean
  ttsSpeaking: boolean
  armRemainingMs?: number | null
  compact?: boolean
}

function formatArmSeconds(armRemainingMs: number | null | undefined): string | null {
  if (armRemainingMs == null || armRemainingMs <= 0) return null
  return `${Math.ceil(armRemainingMs / 1000)}s`
}

export function VoiceStatusIndicator({
  phase,
  livePreview,
  isSupported,
  permissionDenied,
  busy,
  ttsSpeaking,
  armRemainingMs,
  compact = false,
}: VoiceStatusIndicatorProps) {
  if (!isSupported) return null

  if (permissionDenied) {
    return (
      <div className="voiceStatusIndicator" data-phase="denied" data-compact={compact || undefined}>
        <span className="voiceStatusText">마이크 권한이 필요해요. 키보드로 입력해 주세요.</span>
      </div>
    )
  }

  let label = '산책아 하고 말해 주세요'
  let showDot = false

  if (ttsSpeaking) {
    label = '읽는 중'
  } else if (busy) {
    label = '처리 중'
  } else if (phase === 'armed') {
    showDot = true
    const seconds = formatArmSeconds(armRemainingMs)
    label = livePreview
      ? `듣는 중 · ${livePreview}${seconds ? ` (${seconds})` : ''}`
      : `듣는 중${seconds ? ` · ${seconds}` : ''}`
  }

  return (
    <div
      className="voiceStatusIndicator"
      data-phase={phase}
      data-compact={compact || undefined}
      aria-live="polite"
    >
      {showDot ? <span className="voiceStatusDot" aria-hidden /> : null}
      <span className="voiceStatusText">{label}</span>
    </div>
  )
}
