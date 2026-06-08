import { callOpenAiResponsesJson, llmFailureUserMessage } from './llmClient'

export type AlternativePickerCandidate = {
  booksId: string
  title: string
  authors: string
  description?: string
}

export type AlternativePickerResult = {
  pickedBooksId: string
  reason: string
  assistantMessage: string
}

type PickerEnvelope = {
  pickedBooksId?: unknown
  reason?: unknown
  assistantMessage?: unknown
}

export async function pickAlternativeWithLlm(args: {
  rejectedTitle: string
  negativeReason: string
  candidates: AlternativePickerCandidate[]
}): Promise<AlternativePickerResult | null> {
  const res = await callOpenAiResponsesJson<PickerEnvelope>({
    system:
      '너는 도서 보완 추천기다. 사용자가 내려놓은 책과 이유를 반영해 후보 중 1권을 고른다. JSON: {"pickedBooksId":"string","reason":"string","assistantMessage":"string"}. assistantMessage는 2문장 이내 한국어.',
    user: JSON.stringify(args),
    temperature: 0.35,
  })
  if (!res.ok) return null
  const pickedBooksId = String(res.data.pickedBooksId ?? '').trim()
  const reason = String(res.data.reason ?? '').trim()
  const assistantMessage = String(res.data.assistantMessage ?? '').trim()
  if (!pickedBooksId || !assistantMessage) return null
  const valid = args.candidates.some((c) => c.booksId === pickedBooksId)
  if (!valid) {
    const fallback = args.candidates[0]
    if (!fallback) return null
    return {
      pickedBooksId: fallback.booksId,
      reason: reason || args.negativeReason,
      assistantMessage: assistantMessage || `"${fallback.title}"은(는) ${args.negativeReason}에 더 가까울 수 있어요.`,
    }
  }
  return { pickedBooksId, reason, assistantMessage }
}

export function alternativePickerFailureMessage(): string {
  return llmFailureUserMessage('http_error')
}
