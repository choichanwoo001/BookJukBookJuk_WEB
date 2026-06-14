/** Primary wake word: "산책아". Longer phrases first for greedy match. */
export const VOICE_WAKE_WORDS = ['산책아', '산책', '들어봐', '들어줘'] as const

/** Command collection window after wake word. */
export const VOICE_ARM_TIMEOUT_MS = 20_000

/** Silence after speech before auto-submit (armed only). */
export const VOICE_SILENCE_MS = 1_200

export const VOICE_MIN_CHARS = 2

/** Delay before resuming mic after TTS / busy. */
export const VOICE_RESUME_DELAY_MS = 300

export const VOICE_LANG = 'ko-KR'
