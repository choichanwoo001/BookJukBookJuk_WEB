import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type UseBookRecognitionCameraResult = {
  videoRef: RefObject<HTMLVideoElement | null>
  isActive: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => void
  captureFrameBase64: () => string | null
}

export function useBookRecognitionCamera(): UseBookRecognitionCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsActive(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsActive(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : '카메라를 열 수 없습니다.'
      setError(message)
      setIsActive(false)
    }
  }, [stop])

  const captureFrameBase64 = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    const comma = dataUrl.indexOf(',')
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  }, [])

  useEffect(() => () => stop(), [stop])

  return {
    videoRef,
    isActive,
    error,
    start,
    stop,
    captureFrameBase64,
  }
}
