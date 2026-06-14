import { VOICE_MIN_CHARS } from '../config/voiceCommand'

export function isUtteranceSubmittable(commandText: string, minChars = VOICE_MIN_CHARS): boolean {
  return commandText.trim().length >= minChars
}
