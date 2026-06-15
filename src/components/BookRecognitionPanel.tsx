import { useCallback, useEffect, useRef, useState } from 'react'

import { getBookRecognitionClient } from '../agent/bridges/bookRecognitionBridge'
import { isDemoMode } from '../config/demoMode'
import { GESTURE_CONFIRM_FRAMES, GESTURE_LABELS_KO, type GestureId } from '../lib/gestureClassifiers'
import { useBookRecognitionCamera } from '../hooks/useBookRecognitionCamera'
import { useGestureRecognition } from '../hooks/useGestureRecognition'

export type RecognizedBookPreview = {
  title: string
  author?: string
}

export type BookRecognitionPanelProps = {
  busy: boolean
  /** 레거시 UI 캡처 (현재 패널에서는 미사용). */
  onCapture?: (
    reason: 'add' | 'remove' | 'browse',
    imageBase64: string,
    trigger?: 'gesture' | 'ui',
  ) => void | Promise<void>
  /** 표지 인식 후 제스처로 담기/빼기 (인식된 제목 기준). */
  onGestureBookDecision?: (
    reason: 'add' | 'remove',
    book: RecognizedBookPreview,
  ) => void | Promise<void>
  onBrowse?: (imageBase64: string) => void | Promise<void>
  onGestureConfirmed?: (gestureId: GestureId) => void
  placement?: 'map' | 'chat'
}

const IDENTIFY_POLL_MS = 1400

export function BookRecognitionPanel({
  busy,
  onGestureBookDecision,
  onGestureConfirmed,
  placement = 'map',
}: BookRecognitionPanelProps) {
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [recognizedBook, setRecognizedBook] = useState<RecognizedBookPreview | null>(null)
  const [scanning, setScanning] = useState(false)
  const [gestureHint, setGestureHint] = useState<string | null>(null)
  const scanInFlightRef = useRef(false)

  const {
    videoRef,
    isActive,
    error,
    start,
    stop,
    captureFrameBase64,
  } = useBookRecognitionCamera()

  const handleToggleCamera = useCallback(async () => {
    if (isActive) {
      stop()
      setGestureEnabled(false)
      setRecognizedBook(null)
      setGestureHint(null)
      return
    }
    await start()
  }, [isActive, start, stop])

  useEffect(() => {
    if (!isActive || busy || identifying) return undefined
    // 데모 모드에서는 실제 인식 API를 호출하지 않음 → "인식된 책 없음" 상태 유지
    if (isDemoMode()) return undefined

    const tick = async () => {
      if (scanInFlightRef.current) return
      const frame = captureFrameBase64()
      if (!frame) return

      scanInFlightRef.current = true
      setScanning(true)
      try {
        const result = await getBookRecognitionClient().identifyBook({
          reason: 'add',
          imageBase64: frame,
        })
        if (result.ok && result.title?.trim()) {
          setRecognizedBook({
            title: result.title.trim(),
            author: result.author?.trim() || undefined,
          })
          setGestureHint(null)
        } else {
          setRecognizedBook(null)
        }
      } finally {
        scanInFlightRef.current = false
        setScanning(false)
      }
    }

    void tick()
    const timerId = window.setInterval(() => {
      void tick()
    }, IDENTIFY_POLL_MS)
    return () => window.clearInterval(timerId)
  }, [busy, captureFrameBase64, identifying, isActive])

  const runGestureDecision = useCallback(
    (reason: 'add' | 'remove') => {
      if (busy || identifying || !onGestureBookDecision) return
      if (!recognizedBook) {
        setGestureHint('표지를 인식한 뒤 제스처를 해 주세요.')
        return
      }
      setIdentifying(true)
      void Promise.resolve(onGestureBookDecision(reason, recognizedBook)).finally(() => {
        setIdentifying(false)
      })
    },
    [busy, identifying, onGestureBookDecision, recognizedBook],
  )

  const handleGestureConfirmed = useCallback(
    (gestureId: GestureId) => {
      onGestureConfirmed?.(gestureId)

      if (!gestureEnabled) return

      if (gestureId === 'thumbs_up') {
        runGestureDecision('add')
      } else if (gestureId === 'thumbs_down') {
        runGestureDecision('remove')
      }
    },
    [gestureEnabled, onGestureConfirmed, runGestureDecision],
  )

  const gesture = useGestureRecognition({
    videoRef,
    isActive,
    enabled: isActive && gestureEnabled && Boolean(onGestureConfirmed || onGestureBookDecision),
    onConfirmed: handleGestureConfirmed,
  })

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
            <span className="bookRecognitionGestureChip muted">표지 인식 후 제스처로 담기·빼기</span>
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

      {isActive && (
        <div className="bookRecognitionDetected" aria-live="polite">
          {scanning && !recognizedBook ? (
            <span className="bookRecognitionDetectedStatus">표지 인식 중…</span>
          ) : recognizedBook ? (
            <>
              <span className="bookRecognitionDetectedLabel">인식됨</span>
              <strong className="bookRecognitionDetectedTitle">{recognizedBook.title}</strong>
              {recognizedBook.author ? (
                <span className="bookRecognitionDetectedAuthor">{recognizedBook.author}</span>
              ) : null}
              {gestureEnabled ? (
                <span className="bookRecognitionDetectedHint">엄지 ↑ 담기 · ↓ 빼기</span>
              ) : null}
            </>
          ) : (
            <span className="bookRecognitionDetectedStatus">인식된 책 없음</span>
          )}
          {gestureHint ? (
            <span className="bookRecognitionDetectedWarn">{gestureHint}</span>
          ) : null}
        </div>
      )}

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
