/**
 * Web Speech API: main `SpeechRecognition` types are missing from TS `lib.dom.d.ts` here.
 */
export {}

declare global {
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    onend: ((this: SpeechRecognition, ev: Event) => void) | null
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
    onstart: ((this: SpeechRecognition, ev: Event) => void) | null
    start(): void
    stop(): void
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
    readonly message: string
  }

  interface SpeechRecognitionConstructor {
    prototype: SpeechRecognition
    new (): SpeechRecognition
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}
