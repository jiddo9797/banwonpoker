import { Clock20Regular, Mic20Regular, Warning20Filled } from '@fluentui/react-icons'
import type { RecordingState, TableSnapshot } from '../model'
import { EmptyCardSlot, PlayingCard } from './PlayingCard'
import { PlayerSeat } from './PlayerSeat'

function formatChips(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function RecordingStatus({ state }: { state: RecordingState }) {
  if (state === 'hidden') return null

  if (state === 'recording') {
    return (
      <div className="recording-status recording-status--active" role="status">
        <span aria-hidden="true" className="recording-dot" />
        <span>내 차례 · 음성 기록 중</span>
      </div>
    )
  }

  if (state === 'processing') {
    return (
      <div className="recording-status" role="status">
        <Clock20Regular aria-hidden="true" />
        <span>액션 처리 중</span>
        <span className="recording-status-detail">기록 종료됨</span>
      </div>
    )
  }

  return (
    <div className="recording-status recording-status--warning" role="alert">
      <Warning20Filled aria-hidden="true" />
      <span>음성 기록 실패 · 재시도 중</span>
      <span className="recording-status-detail">게임은 계속 진행됩니다</span>
    </div>
  )
}

function HeroSeat({ snapshot }: { snapshot: TableSnapshot }) {
  const warning = (snapshot.heroRemainingSeconds ?? 60) <= 10
  const isTurn = snapshot.recordingState !== 'hidden' || snapshot.actions.some((action) => action.enabled)

  return (
    <div className={`hero-seat ${isTurn ? 'is-turn' : ''} ${snapshot.tableMessage?.includes('승리') ? 'is-winner' : ''}`}>
      {snapshot.heroBet ? <div className="hero-bet-pill">{formatChips(snapshot.heroBet)}</div> : null}
      <div className="hero-card-stack">
        <PlayingCard card={snapshot.heroCards[0]} />
        <PlayingCard card={snapshot.heroCards[1]} className="overlap" />
      </div>
      <div className="hero-panel">
        <div className="hero-name-row">
          <span className="hero-name">나</span>
          {isTurn && snapshot.heroRemainingSeconds !== undefined ? (
            <span className={warning ? 'hero-time is-warning' : 'hero-time'}>
              {snapshot.heroRemainingSeconds}초
            </span>
          ) : null}
        </div>
        <div className="hero-stack">{formatChips(snapshot.heroStack)}</div>
        <span className="position-badge badge-d">D</span>
        {isTurn ? (
          <span aria-hidden="true" className="turn-progress">
            <span
              className="turn-progress-value"
              style={{
                width: `${Math.max(0, Math.min(100, ((snapshot.heroRemainingSeconds ?? 0) / 60) * 100))}%`,
              }}
            />
          </span>
        ) : null}
      </div>
      <RecordingStatus state={snapshot.recordingState} />
    </div>
  )
}

interface GameTableProps {
  snapshot: TableSnapshot
}

export function GameTable({ snapshot }: GameTableProps) {
  return (
    <main aria-label={`핸드 ${snapshot.handNumber} 포커 테이블`} className="game-table-area">
      <div aria-hidden="true" className="poker-table">
        <div className="poker-table-inner" />
      </div>

      <div aria-label="현재 팟" className="pot-cluster">
        <div className="pot-row">
          {snapshot.pots.map((pot) => (
            <div className="pot-pill" key={pot.label}>
              <span>{pot.label}</span>
              <strong>{formatChips(pot.amount)}</strong>
            </div>
          ))}
        </div>
        {snapshot.potNote ? <div className="pot-note">{snapshot.potNote}</div> : null}
      </div>

      <div aria-label={`${snapshot.street} 커뮤니티 카드`} className="community-board">
        <div className="community-cards">
          {snapshot.board.map((card, index) =>
            card ? <PlayingCard card={card} key={`${card.rank}-${card.suit}-${index}`} /> : <EmptyCardSlot key={`empty-${index}`} />,
          )}
        </div>
        <div className="street-row">
          <span className="street-label">{snapshot.street}</span>
          {snapshot.tableMessage ? <span className="table-message">{snapshot.tableMessage}</span> : null}
        </div>
      </div>

      <div aria-label="참가자 좌석" className="seat-layer">
        {snapshot.seats.map((seat) => (
          <PlayerSeat key={seat.id} seat={seat} />
        ))}
      </div>

      <HeroSeat snapshot={snapshot} />

      <div className="privacy-note">
        <Mic20Regular aria-hidden="true" />
        <span>음성은 내 차례에만 기록되며 플레이 중 상대에게 전달되지 않습니다.</span>
      </div>
    </main>
  )
}
