import type { ChatActionCard as ChatActionCardType } from '../agent/types'

type Props = {
  card: ChatActionCardType
  disabled?: boolean
  onSelect: (inputText: string) => void
}

export function ChatActionCard({ card, disabled = false, onSelect }: Props) {
  return (
    <section className="chatActionCard" aria-label="추천 단계 선택 카드">
      <p className="chatActionCardTitle">{card.title}</p>
      {card.description && <p className="chatActionCardDescription">{card.description}</p>}
      <div className="chatActionCardOptions">
        {card.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chatActionCardButton"
            disabled={disabled}
            onClick={() => onSelect(option.inputText)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}
