import { useCallback, useEffect, useRef, useState } from 'react'

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

type SpeechInputOptions = {
  onResult: (transcript: string) => void
  lang?: string
}

export type UseSpeechInputReturn = {
  isListening: boolean
  isSupported: boolean
  livePreview: string
  startListening: () => void
  stopListening: () => void
  cancelListening: () => void
}

export function useSpeechInput({ onResult, lang = 'ko-KR' }: SpeechInputOptions): UseSpeechInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [livePreview, setLivePreview] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  const micSessionRef = useRef(false)
  const userRequestedStopRef = useRef(false)
  const discardOnStopRef = useRef(false)
  const finalBufferRef = useRef('')
  const lastInterimRef = useRef('')

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const isSupported = Boolean(getSpeechRecognitionCtor())

  const flushAndNotifyIfNonEmpty = useCallback(() => {
    const text = (finalBufferRef.current + lastInterimRef.current).trim()
    finalBufferRef.current = ''
    lastInterimRef.current = ''
    setLivePreview('')
    if (text) {
      onResultRef.current(text)
    }
  }, [])

  const startRecognitionRef = useRef<() => void>(() => {})

  const startRecognitionInstance = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor || !micSessionRef.current || userRequestedStopRef.current) return

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimPiece = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i]
        const piece = row[0]?.transcript ?? ''
        if (row.isFinal) {
          finalBufferRef.current += piece
          lastInterimRef.current = ''
        } else {
          interimPiece += piece
        }
      }
      if (interimPiece) {
        lastInterimRef.current = interimPiece
      }
      setLivePreview((finalBufferRef.current + lastInterimRef.current).trim())
    }

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') {
        return
      }
      if (ev.error === 'not-allowed' || ev.error === 'audio-capture') {
        micSessionRef.current = false
        userRequestedStopRef.current = false
        discardOnStopRef.current = false
        finalBufferRef.current = ''
        lastInterimRef.current = ''
        recognitionRef.current = null
        setLivePreview('')
        setIsListening(false)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null

      if (userRequestedStopRef.current) {
        userRequestedStopRef.current = false
        micSessionRef.current = false
        if (discardOnStopRef.current) {
          discardOnStopRef.current = false
          finalBufferRef.current = ''
          lastInterimRef.current = ''
          setLivePreview('')
          setIsListening(false)
          return
        }
        flushAndNotifyIfNonEmpty()
        setIsListening(false)
        return
      }

      if (micSessionRef.current) {
        queueMicrotask(() => {
          startRecognitionRef.current()
        })
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      micSessionRef.current = false
      userRequestedStopRef.current = false
      discardOnStopRef.current = false
      recognitionRef.current = null
      setLivePreview('')
      setIsListening(false)
    }
  }, [flushAndNotifyIfNonEmpty, lang])

  useEffect(() => {
    startRecognitionRef.current = startRecognitionInstance
  }, [startRecognitionInstance])

  const stopListening = useCallback(() => {
    if (!micSessionRef.current && !recognitionRef.current) return
    discardOnStopRef.current = false
    userRequestedStopRef.current = true
    micSessionRef.current = false
    recognitionRef.current?.stop()
  }, [])

  const cancelListening = useCallback(() => {
    if (!micSessionRef.current && !recognitionRef.current) return
    discardOnStopRef.current = true
    userRequestedStopRef.current = true
    micSessionRef.current = false
    recognitionRef.current?.stop()
  }, [])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor || micSessionRef.current) return

    micSessionRef.current = true
    userRequestedStopRef.current = false
    discardOnStopRef.current = false
    finalBufferRef.current = ''
    lastInterimRef.current = ''
    setLivePreview('')
    setIsListening(true)
    startRecognitionInstance()
  }, [startRecognitionInstance])

  useEffect(() => {
    return () => {
      micSessionRef.current = false
      userRequestedStopRef.current = false
      discardOnStopRef.current = false
      recognitionRef.current?.stop()
      recognitionRef.current = null
    }
  }, [])

  return { isListening, isSupported, livePreview, startListening, stopListening, cancelListening }
}
