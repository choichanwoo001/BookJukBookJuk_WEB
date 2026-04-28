export type LlmRuntimeEnv = {
  apiKey: string
  model: string
  timeoutMs: number
}

const DEFAULT_MODEL = 'gpt-4.1-mini'
const DEFAULT_TIMEOUT_MS = 7000

export function readLlmEnv(): LlmRuntimeEnv | null {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim() ?? ''
  if (!apiKey) return null

  const model = import.meta.env.VITE_OPENAI_MODEL?.trim() || DEFAULT_MODEL
  const timeoutRaw = Number.parseInt(import.meta.env.VITE_OPENAI_TIMEOUT_MS?.trim() ?? '', 10)
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 && timeoutRaw <= 30000
      ? timeoutRaw
      : DEFAULT_TIMEOUT_MS

  return { apiKey, model, timeoutMs }
}

