import type { Seat } from '../model'
import { PlayingCard } from './PlayingCard'
import { formatChips } from '../../../shared/format'

function statusLabel(seat: Seat) {
  if (seat.status === 'folded') return '폴드'
  if (seat.status === 'all-in') return '올인'
  if (seat.status === 'disconnected') return '연결 끊김 · 재접속 대기'
  if (seat.status === 'eliminated') return '탈락'
  if (seat.isWinner) return seat.handRank ?? '승리'
  if (seat.handRank) return seat.handRank
  return null
}

interface PlayerSeatProps {
  seat: Seat
}

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const label = statusLabel(seat)
  const classes = [
    'player-seat',
    `player-seat--${seat.position}`,
    `player-seat--${seat.status}`,
    seat.isTurn ? 'is-turn' : '',
    seat.isWinner ? 'is-winner' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (seat.status === 'empty') {
    return (
      <div className={classes}>
        <div className="empty-seat">빈 좌석</div>
      </div>
    )
  }

  return (
    <div className={classes}>
      {seat.status === 'folded' || seat.status === 'eliminated' ? (
        <div className="opponent-card-stack" />
      ) : (
        <div
          aria-label={seat.showdownCards ? `${seat.name}의 공개된 홀카드` : `${seat.name}의 비공개 홀카드 2장`}
          className="opponent-card-stack"
          role="group"
        >
          <PlayingCard card={seat.showdownCards?.[0]} size="small" />
          <PlayingCard card={seat.showdownCards?.[1]} className="overlap" size="small" />
        </div>
      )}

      <div className="seat-panel">
        <div className="seat-name-row">
          <span className="seat-name">{seat.name}</span>
          {seat.isTurn && seat.remainingSeconds !== undefined ? (
            <span className={seat.remainingSeconds <= 10 ? 'seat-time is-warning' : 'seat-time'}>
              {seat.remainingSeconds}초
            </span>
          ) : null}
        </div>
        <div className="seat-stack">{formatChips(seat.stack)}</div>
        {seat.badge ? <span className={`position-badge badge-${seat.badge.toLowerCase()}`}>{seat.badge}</span> : null}
        {seat.isTurn ? (
          <span aria-hidden="true" className="turn-progress">
            <span
              className="turn-progress-value"
              style={{ width: `${Math.max(0, Math.min(100, ((seat.remainingSeconds ?? 0) / 60) * 100))}%` }}
            />
          </span>
        ) : null}
      </div>

      {label ? <div className="seat-status-chip">{label}</div> : null}
      {seat.bet ? <div className="bet-pill">{formatChips(seat.bet)}</div> : null}
    </div>
  )
}
