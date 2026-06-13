import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  classifyOneHandGesture,
  GESTURE_COOLDOWN_FRAMES,
  GESTURE_CONFIRM_FRAMES,
  type GestureId,
} from '../lib/gestureClassifiers'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

type UseGestureRecognitionOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  isActive: boolean
  enabled: boolean
  onConfirmed: (gestureId: GestureId) => void
}

export type UseGestureRecognitionResult = {
  previewGesture: GestureId | null
  previewStreak: number
  loading: boolean
  error: string | null
}

export function useGestureRecognition({
  videoRef,
  isActive,
  enabled,
  onConfirmed,
}: UseGestureRecognitionOptions): UseGestureRecognitionResult {
  const [previewGesture, setPreviewGesture] = useState<GestureId | null>(null)
  const [previewStreak, setPreviewStreak] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onConfirmedRef = useRef(onConfirmed)
  const rafRef = useRef<number | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streakRef = useRef(0)
  const streakLabelRef = useRef<GestureId | null>(null)
  const cooldownRef = useRef(0)
  const previewGestureRef = useRef<GestureId | null>(null)
  const previewStreakRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)

  const setPreview = useCallback((gesture: GestureId | null, streak: number) => {
    if (previewGestureRef.current !== gesture) {
      previewGestureRef.current = gesture
      setPreviewGesture(gesture)
    }
    if (previewStreakRef.current !== streak) {
      previewStreakRef.current = streak
      setPreviewStreak(streak)
    }
  }, [])

  useEffect(() => {
    onConfirmedRef.current = onConfirmed
  }, [onConfirmed])

  useEffect(() => {
    if (!isActive || !enabled) {
      setPreview(null, 0)
      streakRef.current = 0
      streakLabelRef.current = null
      cooldownRef.current = 0
      lastVideoTimeRef.current = -1
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    let cancelled = false

    const boot = async () => {
      setLoading(true)
      setError(null)
      try {
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        })
        if (cancelled) {
          landmarker.close()
          return
        }
        landmarkerRef.current = landmarker
        setLoading(false)
        tick()
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : '제스처 인식을 시작할 수 없습니다.'
        setError(message)
        setLoading(false)
      }
    }

    const tick = () => {
      if (cancelled) return
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      if (video.currentTime === lastVideoTimeRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      lastVideoTimeRef.current = video.currentTime

      const result = landmarker.detectForVideo(video, performance.now())
      let gestureName: GestureId | null = null
      if (result.landmarks) {
        for (const lm of result.landmarks) {
          const one = classifyOneHandGesture(lm)
          if (one !== null) {
            gestureName = one
            break
          }
        }
      }

      if (cooldownRef.current > 0) {
        cooldownRef.current -= 1
        streakRef.current = 0
        streakLabelRef.current = null
        setPreview(null, 0)
      } else if (gestureName === null) {
        streakRef.current = 0
        streakLabelRef.current = null
        setPreview(null, 0)
      } else {
        if (gestureName === streakLabelRef.current) {
          streakRef.current += 1
        } else {
          streakRef.current = 1
          streakLabelRef.current = gestureName
        }
        setPreview(gestureName, streakRef.current)

        if (streakRef.current >= GESTURE_CONFIRM_FRAMES && streakLabelRef.current !== null) {
          const confirmed = streakLabelRef.current
          cooldownRef.current = GESTURE_COOLDOWN_FRAMES
          streakRef.current = 0
          streakLabelRef.current = null
          setPreview(null, 0)
          onConfirmedRef.current(confirmed)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    void boot()

    return () => {
      cancelled = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      landmarkerRef.current?.close?.()
      landmarkerRef.current = null
      lastVideoTimeRef.current = -1
    }
  }, [enabled, isActive, setPreview, videoRef])

  return { previewGesture, previewStreak, loading, error }
}
