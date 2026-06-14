import { VOICE_LANG } from '../config/voiceCommand'

export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor())
}

/** Request mic permission via a user gesture (start then stop quickly). */
export function primeMicrophone(lang = VOICE_LANG): Promise<boolean> {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) return Promise.resolve(false)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      finish(ev.error !== 'not-allowed' && ev.error !== 'audio-capture')
    }

    recognition.onend = () => {
      finish(true)
    }

    try {
      recognition.start()
      window.setTimeout(() => {
        try {
          recognition.stop()
        } catch {
          finish(false)
        }
      }, 150)
    } catch {
      finish(false)
    }
  })
}
