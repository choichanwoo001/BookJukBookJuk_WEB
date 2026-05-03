import { isProceedToken } from './proceedToken'

const bareCancelRe =
  /^\s*(취소|아니요?|됐어|그만|cancel|nope)(?:\s*[,.!?…])*$/iu
const bareCancelNoThanksRe = /^\s*no\s*thanks(?:\s*[.!?…])*$/iu
const bareConfirmExtraRe =
  /^\s*(찬성|네|응|yes|y|확인|proceed)(?:\s*[,.!?…])*$/iu

/**
 * When a destructive action awaits UI confirmation, treat short replies as
 * confirm/cancel without calling the LLM (avoids "오케이" being re-planned as remove_book).
 */
export function resolvePendingConfirmationReply(text: string): 'confirm' | 'cancel' | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (isProceedToken(trimmed)) return 'confirm'

  const compact = trimmed.replace(/\s+/g, ' ')

  if (bareCancelRe.test(compact) || bareCancelNoThanksRe.test(compact)) {
    return 'cancel'
  }
  if (bareConfirmExtraRe.test(compact)) return 'confirm'

  return null
}
