import { describe, expect, it } from 'vitest'
import {
  containsWakeWord,
  extractCommandFromTranscript,
  findWakeWordMatch,
  stripWakeWord,
} from './voiceWakeWord'
import { VOICE_WAKE_WORDS } from '../config/voiceCommand'

describe('voiceWakeWord', () => {
  it('detects primary wake word 산책아', () => {
    expect(containsWakeWord('산책아 추천해줘', VOICE_WAKE_WORDS)).toBe(true)
    expect(findWakeWordMatch('산책아 추천해줘', VOICE_WAKE_WORDS)?.word).toBe('산책아')
  })

  it('detects wake word when STT inserts spaces', () => {
    expect(containsWakeWord('산책 아 추천해줘', VOICE_WAKE_WORDS)).toBe(true)
    expect(stripWakeWord('산책 아 추천해줘', VOICE_WAKE_WORDS)).toBe('추천해줘')
    expect(extractCommandFromTranscript('산책 아 추천해줘', VOICE_WAKE_WORDS, false)).toEqual({
      armed: true,
      command: '추천해줘',
    })
  })

  it('detects alias wake word when STT inserts spaces', () => {
    expect(stripWakeWord('들어 줘 멈춰', VOICE_WAKE_WORDS)).toBe('멈춰')
  })

  it('prefers longer wake word at same position', () => {
    expect(findWakeWordMatch('산책아', VOICE_WAKE_WORDS)?.word).toBe('산책아')
    expect(findWakeWordMatch('산책 추천', VOICE_WAKE_WORDS)?.word).toBe('산책')
  })

  it('strips wake word and leaves command', () => {
    expect(stripWakeWord('산책아 추천해줘', VOICE_WAKE_WORDS)).toBe('추천해줘')
    expect(stripWakeWord('산책아', VOICE_WAKE_WORDS)).toBe('')
  })

  it('supports alias wake words', () => {
    expect(stripWakeWord('들어줘 멈춰', VOICE_WAKE_WORDS)).toBe('멈춰')
  })

  it('extracts command when not yet armed', () => {
    expect(extractCommandFromTranscript('산책아 오케이', VOICE_WAKE_WORDS, false)).toEqual({
      armed: true,
      command: '오케이',
    })
  })

  it('ignores transcript without wake word when idle', () => {
    expect(extractCommandFromTranscript('추천해줘', VOICE_WAKE_WORDS, false)).toEqual({
      armed: false,
      command: '',
    })
  })

  it('accumulates command when already armed', () => {
    expect(extractCommandFromTranscript('오케이', VOICE_WAKE_WORDS, true)).toEqual({
      armed: true,
      command: '오케이',
    })
  })

  it('strips wake word from transcript when already armed', () => {
    expect(extractCommandFromTranscript('산책아 오케이', VOICE_WAKE_WORDS, true)).toEqual({
      armed: true,
      command: '오케이',
    })
  })

  it('re-arms when wake word appears again while armed', () => {
    expect(extractCommandFromTranscript('산책아 멈춰', VOICE_WAKE_WORDS, true)).toEqual({
      armed: true,
      command: '멈춰',
    })
  })
})
