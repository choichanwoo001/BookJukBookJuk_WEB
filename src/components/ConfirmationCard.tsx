import type { PendingConfirmation } from '../agent/types'

type Props = {
  pending: PendingConfirmation
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationCard({ pending, onConfirm, onCancel }: Props) {
  return (
    <div className="confirmationCard" role="dialog" aria-labelledby="confirmationCardTitle">
      <div className="confirmationCardInner">
        <h3 id="confirmationCardTitle" className="confirmationCardTitle">
          실행 확인
        </h3>
        <p className="confirmationCardSummary">{pending.summary}</p>
        <div className="confirmationCardActions">
          <button type="button" className="confirmationCardConfirm" onClick={onConfirm}>
            확인
          </button>
          <button type="button" className="confirmationCardCancel" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
