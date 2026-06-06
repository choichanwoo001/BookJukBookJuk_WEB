import { useCallback, useState } from 'react'
import { useBookRecognitionCamera } from '../hooks/useBookRecognitionCamera'

export type BookRecognitionPanelProps = {
  busy: boolean
  onCapture: (reason: 'add' | 'remove', imageBase64: string) => void | Promise<void>
}

export function BookRecognitionPanel({ busy, onCapture }: BookRecognitionPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const {
    videoRef,
    isActive,
    error,
    start,
    stop,
    captureFrameBase64,
  } = useBookRecognitionCamera()

  const handleToggle = useCallback(async () => {
    if (isActive) {
      stop()
      return
    }
    await start()
  }, [isActive, start, stop])

  const handleCapture = useCallback(
    async (reason: 'add' | 'remove') => {
      const frame = captureFrameBase64()
      if (!frame) {
        setLastAction('프레임을 캡처하지 못했어요. 카메라가 켜져 있는지 확인해 주세요.')
        return
      }
      setLastAction(reason === 'add' ? '표지 인식 후 담는 중…' : '표지 인식 후 빼는 중…')
      await onCapture(reason, frame)
      setLastAction(null)
    },
    [captureFrameBase64, onCapture],
  )

  return (
    <div className="bookRecognitionPanel">
      <button
        type="button"
        className="bookRecognitionToggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        책 표지 인식
        <span className={`bookRecognitionBadge${isActive ? ' bookRecognitionBadge--live' : ''}`}>
          {isActive ? '카메라 켜짐' : '카메라 꺼짐'}
        </span>
      </button>
      {expanded && (
        <div className="bookRecognitionBody">
          <p className="bookRecognitionHint">
            표지를 카메라에 비춘 뒤 담기/빼기를 누르세요. 로컬{' '}
            <code>book_recognition</code> API(uvicorn :8787)가 실행 중이어야 합니다.
          </p>
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
          </div>
          {error && (
            <p className="bookRecognitionError" role="alert">
              {error}
            </p>
          )}
          {lastAction && (
            <p className="bookRecognitionStatus" aria-live="polite">
              {lastAction}
            </p>
          )}
          <div className="bookRecognitionActions">
            <button type="button" onClick={() => void handleToggle()} disabled={busy}>
              {isActive ? '카메라 끄기' : '카메라 켜기'}
            </button>
            <button
              type="button"
              onClick={() => void handleCapture('add')}
              disabled={busy || !isActive}
            >
              담기
            </button>
            <button
              type="button"
              onClick={() => void handleCapture('remove')}
              disabled={busy || !isActive}
            >
              빼기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
