import { Clock20Regular, Mic20Regular, MicOff20Regular, Warning20Filled } from '@fluentui/react-icons'
import { streetBetTotal } from '../model'
import type { RecordingState, TableSnapshot } from '../model'
import { EmptyCardSlot, FlipInCard, PlayingCard } from './PlayingCard'
import { PlayerSeat } from './PlayerSeat'
import { formatChips } from '../../../shared/format'

/** 플랍 카드끼리 뒤집히기 시작하는 간격 */
const FLOP_STAGGER_MS = 140

function RecordingStatus({ state, voiceless }: { state: RecordingState; voiceless: boolean }) {
  if (state === 'hidden') return null

  if (voiceless && state !== 'processing') {
    return (
      <div className="recording-status" role="status">
        <MicOff20Regular aria-hidden="true" />
        <span>내 차례 · 음성 없이 참여 중</span>
      </div>
    )
  }

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
        {voiceless ? null : <span className="recording-status-detail">기록 종료됨</span>}
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

function HeroSeat({ snapshot, voiceless, heroLabel }: { snapshot: TableSnapshot; voiceless: boolean; heroLabel: string }) {
  const warning = (snapshot.heroRemainingSeconds ?? 60) <= 10
  const isTurn = snapshot.recordingState !== 'hidden' || snapshot.actions.some((action) => action.enabled)

  return (
    <div className={`hero-seat ${isTurn ? 'is-turn' : ''} ${(snapshot.heroIsWinner ?? snapshot.tableMessage?.includes('승리')) ? 'is-winner' : ''}`}>
      {snapshot.heroBet ? (
        <div className="hero-bet-pill">{formatChips(snapshot.heroBet)}</div>
      ) : snapshot.heroChecked ? (
        <div className="hero-bet-pill">check</div>
      ) : null}
      {snapshot.heroHandName ? (
        <div className="hero-hand-name">
          <span className="visually-hidden">내 족보: </span>
          {snapshot.heroHandName}
        </div>
      ) : null}
      <div className="hero-card-stack">
        {snapshot.heroCards ? (
          <>
            <PlayingCard card={snapshot.heroCards[0]} />
            <PlayingCard card={snapshot.heroCards[1]} className="overlap" />
          </>
        ) : null}
      </div>
      <div className="hero-panel">
        <div className="hero-name-row">
          <span className="hero-name">{heroLabel}</span>
          {isTurn && snapshot.heroRemainingSeconds !== undefined ? (
            <span className={warning ? 'hero-time is-warning' : 'hero-time'}>
              {snapshot.heroRemainingSeconds}초
            </span>
          ) : null}
        </div>
        <div className="hero-stack">{formatChips(snapshot.heroStack)}</div>
        {snapshot.heroBadge === 'none' ? null : (
          <span className={`position-badge badge-${snapshot.heroBadge.toLowerCase()}`}>{snapshot.heroBadge}</span>
        )}
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
      <RecordingStatus state={snapshot.recordingState} voiceless={voiceless} />
    </div>
  )
}

interface GameTableProps {
  snapshot: TableSnapshot
  voiceless?: boolean
  /** 내 좌석에 보일 이름. 관전 중이면 `관전 중` */
  heroLabel?: string
  /** 음성 기록 안내를 보여줄지. 녹음이 아직 연결되지 않은 실제 게임에서는 숨긴다. */
  showRecordingNote?: boolean
  /** 게임 중에 내 음성 기록을 끄거나 켠다. 있으면 안내 옆에 버튼을 보여준다. */
  onToggleVoice?: () => void
}

export function GameTable({ snapshot, voiceless = false, heroLabel = '나', showRecordingNote = true, onToggleVoice }: GameTableProps) {
  // 큰 숫자는 지난 스트리트까지 모인 팟, total 배지는 이번 스트리트에 낸 칩까지 더한 합이다.
  // 사이드 팟이 있으면 total은 마지막 알약에만 붙인다(모든 팟의 합).
  const streetBets = streetBetTotal(snapshot)
  const potTotal = snapshot.pots.reduce((sum, pot) => sum + pot.amount, 0) + streetBets
  const singlePot = snapshot.pots.length === 1

  return (
    <main aria-labelledby="table-title" className="game-table-area">
      <h1 className="visually-hidden" id="table-title">
        핸드 #{snapshot.handNumber} 포커 테이블 · {snapshot.street}
      </h1>
      <div aria-hidden="true" className="poker-table">
        <div className="poker-table-inner" />
      </div>

      <div aria-label="현재 팟" className="pot-cluster" role="group">
        <div className="pot-row">
          {snapshot.pots.map((pot, index) => (
            <div aria-label={`${pot.label} ${formatChips(pot.amount)}`} className="pot-pill" key={pot.label} role="group">
              {/* 팟이 하나면 글자 없이 금액만 쓴다. 사이드 팟이 있으면 어느 팟인지 보여야 하므로 남긴다. */}
              {singlePot ? null : <span aria-hidden="true">{pot.label}</span>}
              <strong aria-hidden="true">{formatChips(pot.amount)}</strong>
              {streetBets > 0 && index === snapshot.pots.length - 1 ? (
                <span className="pot-total">
                  <span aria-hidden="true">total</span>
                  <span className="visually-hidden">이번 스트리트 포함 합계</span>
                  <strong>{formatChips(potTotal)}</strong>
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {snapshot.potNote ? <div className="pot-note">{snapshot.potNote}</div> : null}
      </div>

      <div aria-label={`${snapshot.street} 커뮤니티 카드`} className="community-board" role="group">
        <div className="community-cards">
          {snapshot.board.map((card, index) =>
            card ? (
              // 플랍 세 장은 차례로 조금씩 늦게 뒤집는다. 턴·리버는 바로 뒤집는다.
              <FlipInCard card={card} delayMs={index < 3 ? index * FLOP_STAGGER_MS : 0} key={`${card.rank}-${card.suit}-${index}`} />
            ) : (
              <EmptyCardSlot key={`empty-${index}`} />
            ),
          )}
        </div>
        <div className="street-row">
          <span className="street-label">{snapshot.street}</span>
          {snapshot.tableMessage ? <span className="table-message">{snapshot.tableMessage}</span> : null}
        </div>
      </div>

      <div aria-label="참가자 좌석" className="seat-layer" role="group">
        {snapshot.seats.map((seat) => (
          <PlayerSeat key={seat.id} seat={seat} />
        ))}
      </div>

      <HeroSeat heroLabel={heroLabel} snapshot={snapshot} voiceless={voiceless} />

      {showRecordingNote ? (
      <div className="privacy-note">
        {voiceless ? <MicOff20Regular aria-hidden="true" /> : <Mic20Regular aria-hidden="true" />}
        <span>
          {voiceless
            ? '음성 없이 참여 중입니다. 내 차례에도 음성이 기록되지 않습니다.'
            : '음성은 내 차례에만 기록되며 플레이 중 상대에게 전달되지 않습니다.'}
        </span>
        {onToggleVoice ? (
          <button className={voiceless ? 'voice-toggle is-off' : 'voice-toggle'} onClick={onToggleVoice} type="button">
            {voiceless ? '음성 켜기' : '음성 끄기'}
          </button>
        ) : null}
      </div>
      ) : null}
    </main>
  )
}
