import { useCallback, useEffect, useRef, useState } from 'react'

import { getBookRecognitionClient } from '../agent/bridges/bookRecognitionBridge'
import { DESTINATION_ARRIVAL_PAUSE_MS } from '../config/constants'
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
  /** 데모 시나리오: 서가/우연한 발견 구간에서 표시할 책. */
  activeBook?: RecognizedBookPreview | null
  /** 카메라 켜진 뒤 책 살펴보기 카운트다운 표시. */
  dwellCountdownActive?: boolean
  dwellCountdownMs?: number
  /** 카운트다운 완료 시 관심 있음으로 보고 (우연한 발견). */
  trackBrowseInterest?: boolean
  onBrowseInterestDetected?: (book: RecognizedBookPreview) => void
  placement?: 'map' | 'chat'
}

const IDENTIFY_POLL_MS = 1400

export function BookRecognitionPanel({
  busy,
  onGestureBookDecision,
  onGestureConfirmed,
  activeBook = null,
  dwellCountdownActive = false,
  dwellCountdownMs = DESTINATION_ARRIVAL_PAUSE_MS,
  trackBrowseInterest = false,
  onBrowseInterestDetected,
  placement = 'map',
}: BookRecognitionPanelProps) {
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [recognizedBook, setRecognizedBook] = useState<RecognizedBookPreview | null>(null)
  const [scanning, setScanning] = useState(false)
  const [gestureHint, setGestureHint] = useState<string | null>(null)
  const [countdownSec, setCountdownSec] = useState<number | null>(null)
  const scanInFlightRef = useRef(false)
  const interestReportedRef = useRef(false)

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
      setCountdownSec(null)
      interestReportedRef.current = false
      return
    }
    await start()
  }, [isActive, start, stop])

  useEffect(() => {
    if (!isDemoMode() || !isActive || !activeBook) {
      if (isDemoMode() && !isActive) {
        setRecognizedBook(null)
      }
      return
    }
    setRecognizedBook(activeBook)
    setGestureHint(null)
  }, [activeBook, isActive])

  useEffect(() => {
    interestReportedRef.current = false
    setCountdownSec(null)
    if (!dwellCountdownActive || !isActive || !activeBook) return undefined

    const totalMs = dwellCountdownMs
    const startedAt = Date.now()
    setCountdownSec(Math.ceil(totalMs / 1000))

    const timerId = window.setInterval(() => {
      const remaining = Math.max(0, totalMs - (Date.now() - startedAt))
      setCountdownSec(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        window.clearInterval(timerId)
        if (trackBrowseInterest && !interestReportedRef.current) {
          interestReportedRef.current = true
          onBrowseInterestDetected?.(activeBook)
        }
      }
    }, 200)

    return () => window.clearInterval(timerId)
  }, [
    activeBook,
    dwellCountdownActive,
    dwellCountdownMs,
    isActive,
    onBrowseInterestDetected,
    trackBrowseInterest,
  ])

  useEffect(() => {
    if (!isActive || busy || identifying) return undefined
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
        {isActive && countdownSec !== null && countdownSec > 0 && (
          <div className="bookRecognitionCountdownOverlay" aria-live="polite">
            <span className="bookRecognitionCountdownLabel">책 살펴보기</span>
            <span className="bookRecognitionCountdownValue">{countdownSec}초</span>
          </div>
        )}
        {isActive && countdownSec === 0 && trackBrowseInterest && (
          <div className="bookRecognitionCountdownOverlay" aria-live="polite">
            <span className="bookRecognitionCountdownDone">관심 있음으로 기록됨</span>
          </div>
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
