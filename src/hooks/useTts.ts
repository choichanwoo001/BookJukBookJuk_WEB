import { useCallback, useEffect, useRef, useState } from 'react'
import { readLlmEnv } from '../agent/runtime/llmEnv'

const LS_KEY = 'ttsEnabled'
const MAX_TEXT_LENGTH = 300

function readTtsVoice(): string {
  const v = (import.meta.env.VITE_TTS_VOICE as string | undefined)?.trim()
  return v || 'nova'
}

function readInitialEnabled(): boolean {
  try {
    const stored = localStorage.getItem(LS_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export type UseTtsReturn = {
  speak: (text: string) => Promise<void>
  cancel: () => void
  enabled: boolean
  setEnabled: (v: boolean) => void
  speaking: boolean
}

export function useTts(): UseTtsReturn {
  const [enabled, setEnabledState] = useState(readInitialEnabled)
  const [speaking, setSpeaking] = useState(false)

  const queueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const playNextRef = useRef<(() => Promise<void>) | null>(null)

  const playNext = useCallback(async () => {
    if (playingRef.current) return
    const text = queueRef.current.shift()
    if (!text) return

    const env = readLlmEnv()
    if (!env) return

    playingRef.current = true
    setSpeaking(true)

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text.slice(0, MAX_TEXT_LENGTH),
          voice: readTtsVoice(),
          response_format: 'mp3',
        }),
      })

      if (!response.ok) {
        console.warn('[TTS] API error', response.status)
        playingRef.current = false
        setSpeaking(false)
        void playNextRef.current?.()
        return
      }

      const arrayBuffer = await response.arrayBuffer()

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const audioCtx = audioCtxRef.current
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtx.destination)
      currentSourceRef.current = source

      source.onended = () => {
        currentSourceRef.current = null
        playingRef.current = false
        setSpeaking(false)
        void playNextRef.current?.()
      }
      source.start()
    } catch (err) {
      console.warn('[TTS] playback error', err)
      playingRef.current = false
      setSpeaking(false)
      void playNextRef.current?.()
    }
  }, [])

  useEffect(() => {
    playNextRef.current = playNext
  }, [playNext])

  const speak = useCallback(
    async (text: string) => {
      if (!enabledRef.current) return
      const trimmed = text.trim()
      if (!trimmed) return
      queueRef.current.push(trimmed)
      await playNext()
    },
    [playNext],
  )

  const cancel = useCallback(() => {
    try {
      currentSourceRef.current?.stop()
    } catch {
      // already stopped
    }
    currentSourceRef.current = null
    queueRef.current = []
    playingRef.current = false
    setSpeaking(false)
  }, [])

  const setEnabled = useCallback(
    (v: boolean) => {
      setEnabledState(v)
      try {
        localStorage.setItem(LS_KEY, String(v))
      } catch {
        // ignore storage errors
      }
      if (!v) cancel()
    },
    [cancel],
  )

  useEffect(() => {
    return () => {
      try {
        currentSourceRef.current?.stop()
      } catch {
        // ignore
      }
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  return { speak, cancel, enabled, setEnabled, speaking }
}
