import { useCallback, useState } from 'react'

import { GESTURE_CONFIRM_FRAMES, GESTURE_LABELS_KO, type GestureId } from '../lib/gestureClassifiers'
import { useBookRecognitionCamera } from '../hooks/useBookRecognitionCamera'
import { useGestureRecognition } from '../hooks/useGestureRecognition'

export type BookRecognitionPanelProps = {
  busy: boolean
  onCapture: (
    reason: 'add' | 'remove' | 'browse',
    imageBase64: string,
    trigger?: 'gesture' | 'ui',
  ) => void | Promise<void>
  onBrowse?: (imageBase64: string) => void | Promise<void>
  onGestureConfirmed?: (gestureId: GestureId) => void
  placement?: 'map' | 'chat'
}

export function BookRecognitionPanel({
  busy,
  onCapture,
  onGestureConfirmed,
  placement = 'map',
}: BookRecognitionPanelProps) {
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [identifying, setIdentifying] = useState(false)

  const {
    videoRef,
    isActive,
    error,
    start,
    stop,
    captureFrameBase64,
  } = useBookRecognitionCamera()

  const runCapture = useCallback(
    (reason: 'add' | 'remove', trigger: 'gesture' | 'ui') => {
      if (busy || identifying || !onCapture || !isActive) return
      const frame = captureFrameBase64()
      if (!frame) return

      setIdentifying(true)
      void Promise.resolve(onCapture(reason, frame, trigger)).finally(() => {
        setIdentifying(false)
      })
    },
    [busy, captureFrameBase64, identifying, isActive, onCapture],
  )

  const handleGestureConfirmed = useCallback(
    (gestureId: GestureId) => {
      onGestureConfirmed?.(gestureId)

      if (!gestureEnabled) return

      if (gestureId === 'thumbs_up') {
        runCapture('add', 'gesture')
      } else if (gestureId === 'thumbs_down') {
        runCapture('remove', 'gesture')
      }
    },
    [gestureEnabled, onGestureConfirmed, runCapture],
  )

  const gesture = useGestureRecognition({
    videoRef,
    isActive,
    enabled: isActive && gestureEnabled && Boolean(onGestureConfirmed),
    onConfirmed: handleGestureConfirmed,
  })

  const handleToggleCamera = useCallback(async () => {
    if (isActive) {
      stop()
      setGestureEnabled(false)
      return
    }
    await start()
  }, [isActive, start, stop])

  const previewLabel = gesture.previewGesture ? GESTURE_LABELS_KO[gesture.previewGesture] : null

  return (
    <div
      className={`bookRecognitionPanel${placement === 'map' ? ' mapCameraPip' : ''}`}
      data-placement={placement}
    >
      <div className="bookRecognitionHeader">
        <span className="bookRecognitionTitle">책 표지 인식</span>
        <button
          type="button"
          className="bookRecognitionCameraButton"
          onClick={() => void handleToggleCamera()}
          disabled={busy}
          data-active={isActive}
        >
          {isActive ? '카메라 끄기' : '카메라 켜기'}
        </button>
      </div>

      <div className="bookRecognitionPreviewWrap">
        <video
          ref={videoRef}
          className="bookRecognitionVideo"
          playsInline
          muted
          aria-label="책 표지 인식 카메라 미리보기"
        />
        {!isActive && (
          <div className="bookRecognitionVideoPlaceholder">카메라 미리보기</div>
        )}
        {isActive && !gestureEnabled && (
          <div className="bookRecognitionGestureOverlay" aria-live="polite">
            <span className="bookRecognitionGestureChip muted">제스처 켜기 후 엄지로 담기·빼기</span>
          </div>
        )}
        {isActive && gestureEnabled && (
          <div className="bookRecognitionGestureOverlay" aria-live="polite">
            {gesture.loading ? (
              <span className="bookRecognitionGestureChip">제스처 로딩…</span>
            ) : previewLabel ? (
              <span className="bookRecognitionGestureChip" data-confirmed={gesture.previewStreak >= GESTURE_CONFIRM_FRAMES}>
                {previewLabel}
                <span className="bookRecognitionGestureStreak">
                  {gesture.previewStreak}/{GESTURE_CONFIRM_FRAMES}
                </span>
              </span>
            ) : (
              <span className="bookRecognitionGestureChip muted">손을 비춰 주세요</span>
            )}
          </div>
        )}
      </div>

      <div className="bookRecognitionActions">
        <button
          type="button"
          className="bookRecognitionGestureToggle"
          onClick={() => setGestureEnabled((prev) => !prev)}
          disabled={!isActive || busy}
          data-active={gestureEnabled}
          aria-pressed={gestureEnabled}
        >
          {gestureEnabled ? '제스처 끄기' : '제스처 켜기'}
        </button>
      </div>

      {error && (
        <p className="bookRecognitionError" role="alert">
          {error}
        </p>
      )}
      {gestureEnabled && gesture.error && (
        <p className="bookRecognitionError" role="alert">
          {gesture.error}
        </p>
      )}
    </div>
  )
}
