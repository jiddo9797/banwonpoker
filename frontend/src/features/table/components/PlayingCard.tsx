import type { Card, Suit } from '../model'

const suitMeta: Record<Suit, { symbol: string; name: string }> = {
  spade: { symbol: '♠', name: '스페이드' },
  heart: { symbol: '♥', name: '하트' },
  diamond: { symbol: '♦', name: '다이아몬드' },
  club: { symbol: '♣', name: '클럽' },
}

const rankNames: Record<string, string> = {
  A: '에이스',
  K: '킹',
  Q: '퀸',
  J: '잭',
  T: '텐',
}

interface PlayingCardProps {
  card?: Card
  size?: 'large' | 'small'
  hidden?: boolean
  className?: string
}

export function PlayingCard({
  card,
  size = 'large',
  hidden = false,
  className = '',
}: PlayingCardProps) {
  if (hidden) {
    return <span className={`playing-card playing-card--hidden playing-card--${size} ${className}`} />
  }

  if (!card) {
    return (
      <span
        aria-label="비공개 카드"
        className={`playing-card playing-card--back playing-card--${size} ${className}`}
        role="img"
      >
        <span aria-hidden="true" className="card-back-mark" />
      </span>
    )
  }

  const suit = suitMeta[card.suit]
  const rankName = rankNames[card.rank] ?? card.rank

  return (
    <span
      aria-label={`${rankName} ${suit.name}`}
      className={`playing-card playing-card--front playing-card--${size} suit-${card.suit} ${className}`}
      role="img"
    >
      <span className="card-corner" aria-hidden="true">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{suit.symbol}</span>
      </span>
      <span className="card-suit-large" aria-hidden="true">
        {suit.symbol}
      </span>
    </span>
  )
}

export function EmptyCardSlot({ size = 'large' }: { size?: PlayingCardProps['size'] }) {
  return <span aria-hidden="true" className={`playing-card playing-card--empty playing-card--${size}`} />
}
