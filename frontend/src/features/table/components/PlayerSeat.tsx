import type { Seat, SeatPosition } from '../model'
import { PlayingCard } from './PlayingCard'
import { Avatar } from '../../../shared/Avatar'
import { formatChips } from '../../../shared/format'

function statusLabel(seat: Seat) {
  if (seat.status === 'all-in') return '올인'
  if (seat.status === 'disconnected') return '연결 끊김 · 재접속 대기'
  if (seat.status === 'eliminated') return '탈락'
  if (seat.isWinner) return seat.handRank ?? '승리'
  if (seat.handRank) return seat.handRank
  return null
}

/** 내 왼쪽부터 시계 방향 순서. 아바타 색을 좌석 순서대로 고른다. */
const SEAT_ORDER: SeatPosition[] = ['bottom-left', 'top-left', 'top-center', 'top-right', 'bottom-right']

/** 칩 아이콘이 붙은 베팅 금액, 체크면 글자만 */
export function BetPill({ amount, checked, className = 'bet-pill' }: { amount?: number; checked?: boolean; className?: string }) {
  if (amount) {
    return (
      <div className={className}>
        <span aria-hidden="true" className="chip-icon" />
        {formatChips(amount)}
      </div>
    )
  }
  if (checked) return <div className={`${className} is-check`}>체크</div>
  return null
}

interface PlayerSeatProps {
  seat: Seat
}

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const folded = seat.status === 'folded'
  const label = folded ? null : (seat.statusNote ?? statusLabel(seat))
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

  const warning = (seat.remainingSeconds ?? 60) <= 10

  return (
    <div className={classes}>
      {folded || seat.status === 'eliminated' || seat.inHand === false ? null : (
        <div
          aria-label={seat.showdownCards ? `${seat.name}의 공개된 홀카드` : `${seat.name}의 비공개 홀카드 2장`}
          className={seat.showdownCards ? 'opponent-card-stack is-shown' : 'opponent-card-stack'}
          role="group"
        >
          <PlayingCard card={seat.showdownCards?.[0]} size="small" />
          <PlayingCard card={seat.showdownCards?.[1]} className="overlap" size="small" />
        </div>
      )}

      <div className="seat-panel">
        <Avatar index={SEAT_ORDER.indexOf(seat.position)} muted={folded || seat.status === 'eliminated'} name={seat.name} />
        <div className="seat-info">
          <span className="seat-name">{seat.name}</span>
          <span className="seat-stack">{formatChips(seat.stack)}</span>
        </div>
        <div className="seat-side">
          {folded ? <span className="seat-fold-pill">폴드</span> : null}
          {!folded && seat.badge ? <span className={`position-badge badge-${seat.badge.toLowerCase()}`}>{seat.badge}</span> : null}
          {seat.isTurn && seat.remainingSeconds !== undefined ? (
            <span className={warning ? 'seat-time is-warning' : 'seat-time'}>{seat.remainingSeconds}초</span>
          ) : null}
        </div>
        {seat.isTurn ? (
          <span aria-hidden="true" className={warning ? 'turn-progress is-warning' : 'turn-progress'}>
            <span
              className="turn-progress-value"
              style={{ width: `${Math.max(0, Math.min(100, ((seat.remainingSeconds ?? 0) / 60) * 100))}%` }}
            />
          </span>
        ) : null}
      </div>

      {label ? <div className="seat-status-chip">{label}</div> : null}
      <BetPill amount={seat.bet} checked={seat.checked} />
    </div>
  )
}
