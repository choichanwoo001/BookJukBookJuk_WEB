import { useCallback, useEffect, useRef, useState } from 'react'

import { readLlmEnv } from '../agent/runtime/llmEnv'



const LS_KEY = 'ttsEnabled'

const MAX_TEXT_LENGTH = 300

/** 채팅 나레이션(TTS) 재생 배속. */

const TTS_PLAYBACK_RATE = 1.5



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

  speakAndWait: (text: string) => Promise<void>

  cancel: () => void

  enabled: boolean

  setEnabled: (v: boolean) => void

  speaking: boolean

  isEnabled: () => boolean

}



export function useTts(): UseTtsReturn {

  const [enabled, setEnabledState] = useState(readInitialEnabled)

  const [speaking, setSpeaking] = useState(false)



  const queueRef = useRef<string[]>([])

  const playingRef = useRef(false)

  const audioCtxRef = useRef<AudioContext | null>(null)

  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const enabledRef = useRef(enabled)

  const waitResolversRef = useRef<Array<() => void>>([])



  useEffect(() => {

    enabledRef.current = enabled

  }, [enabled])



  const playNextRef = useRef<(() => Promise<void>) | null>(null)



  const resolveWaiters = useCallback(() => {

    const resolvers = waitResolversRef.current.splice(0)

    for (const resolve of resolvers) resolve()

  }, [])



  const stopCurrentSource = useCallback(() => {

    try {

      currentSourceRef.current?.stop()

    } catch {

      // already stopped

    }

    currentSourceRef.current = null

  }, [])



  const fetchAndDecode = useCallback(async (text: string): Promise<AudioBuffer | null> => {

    const env = readLlmEnv()

    if (!env) return null



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

      return null

    }



    const arrayBuffer = await response.arrayBuffer()



    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {

      audioCtxRef.current = new AudioContext()

    }

    const audioCtx = audioCtxRef.current

    if (audioCtx.state === 'suspended') {

      await audioCtx.resume()

    }



    return audioCtx.decodeAudioData(arrayBuffer)

  }, [])



  const playBuffer = useCallback(

    (audioBuffer: AudioBuffer): Promise<void> =>

      new Promise((resolve) => {

        const audioCtx = audioCtxRef.current

        if (!audioCtx) {

          resolve()

          return

        }

        const source = audioCtx.createBufferSource()

        source.buffer = audioBuffer

        source.playbackRate.value = TTS_PLAYBACK_RATE

        source.connect(audioCtx.destination)

        currentSourceRef.current = source

        playingRef.current = true

        setSpeaking(true)



        source.onended = () => {

          currentSourceRef.current = null

          playingRef.current = false

          setSpeaking(false)

          resolve()

          resolveWaiters()

          void playNextRef.current?.()

        }

        source.start()

      }),

    [resolveWaiters],

  )



  const playNext = useCallback(async () => {

    if (playingRef.current) return

    const text = queueRef.current.shift()

    if (!text) return



    try {

      const buffer = await fetchAndDecode(text)

      if (!buffer) {

        playingRef.current = false

        setSpeaking(false)

        void playNextRef.current?.()

        return

      }

      await playBuffer(buffer)

    } catch (err) {

      console.warn('[TTS] playback error', err)

      playingRef.current = false

      setSpeaking(false)

      void playNextRef.current?.()

    }

  }, [fetchAndDecode, playBuffer])



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



  const speakAndWait = useCallback(

    async (text: string) => {

      if (!enabledRef.current) return

      const trimmed = text.trim()

      if (!trimmed) return



      stopCurrentSource()

      queueRef.current = []

      playingRef.current = false



      try {

        const buffer = await fetchAndDecode(trimmed)

        if (!buffer) return

        await playBuffer(buffer)

      } catch (err) {

        console.warn('[TTS] speakAndWait error', err)

        playingRef.current = false

        setSpeaking(false)

      }

    },

    [fetchAndDecode, playBuffer, stopCurrentSource],

  )



  const cancel = useCallback(() => {

    stopCurrentSource()

    queueRef.current = []

    playingRef.current = false

    setSpeaking(false)

    resolveWaiters()

  }, [resolveWaiters, stopCurrentSource])



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



  const isEnabled = useCallback(() => enabledRef.current, [])



  useEffect(() => {

    return () => {

      stopCurrentSource()

      audioCtxRef.current?.close().catch(() => {})

    }

  }, [stopCurrentSource])



  return { speak, speakAndWait, cancel, enabled, setEnabled, speaking, isEnabled }

}


