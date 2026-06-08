import { readLlmEnv } from '../agent/runtime/llmEnv'

export function isDemoMode(): boolean {
  const raw = import.meta.env.VITE_DEMO_MODE?.trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

export function isLlmConfigured(): boolean {
  return readLlmEnv() !== null
}

export function demoRequiresLlm(): boolean {
  return isDemoMode()
}
