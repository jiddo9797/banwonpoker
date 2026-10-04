import { Speaker220Regular } from '@fluentui/react-icons'
import { formatBb, formatChips } from '../../../shared/format'
import { EmptyCardSlot, PlayingCard } from '../../table/components/PlayingCard'
import { streetLabels, visibleBoardCount } from '../fixtures'
import type { ReplayHand, ReplayPlayer } from '../model'
import { stackAt, streetBetAt } from '../stacks'

interface PlayerView {
  player: ReplayPlayer
  folded: boolean
  isActor: boolean
  /** 이 칸까지 반영한 남은 칩. 기록이 없으면 undefined */
  stack: number | undefined
  /** 이번 스트리트에 낸 칩 */
  streetBet: number
}

function playerViews(hand: ReplayHand, index: number): PlayerView[] {
  const played = hand.actions.slice(0, index + 1)
  const current = hand.actions[index]

  return hand.players.map((player) => {
    const own = played.filter((action) => action.playerId === player.id)
    return {
      player,
      folded: own.some((action) => action.kind === 'fold'),
      isActor: current?.playerId === player.id,
      stack: stackAt(hand, player.id, index),
      streetBet: streetBetAt(hand, player.id, index),
    }
  })
}

interface ReplayTableProps {
  hand: ReplayHand
  index: number
  playing: boolean
}

export function ReplayTable({ hand, index, playing }: ReplayTableProps) {
  const current = hand.actions[index]
  const shownCards = Math.min(visibleBoardCount[current.street], hand.board.length)
  const boardSlots = Array.from({ length: 5 }, (_, slot) => (slot < shownCards ? hand.board[slot] : null))

  return (
    <section aria-label={`핸드 ${hand.number} 복기 테이블`} className="replay-stage">
      <div aria-hidden="true" className="replay-felt" />

      <div className="replay-pot">
        <span>팟</span>
        <strong>{formatChips(current.pot)}</strong>
      </div>

      <div aria-label={`${streetLabels[current.street]} 커뮤니티 카드`} className="replay-board" role="group">
        {boardSlots.map((card, cardIndex) =>
          card ? (
            <PlayingCard card={card} key={`${card.rank}-${card.suit}`} size="small" />
          ) : (
            <EmptyCardSlot key={`empty-${cardIndex}`} size="small" />
          ),
        )}
      </div>

      <div className="replay-street">
        <span className="street-label">{streetLabels[current.street]}</span>
        {current.kind === 'result' ? <span className="table-message">{hand.result}</span> : null}
      </div>

      {/* 좌석에는 남은 칩과 이번 스트리트에 낸 칩을 실제 테이블처럼 보여준다. 액션 글자(콜·레이즈 등)는 현재 액션 칸에서만 쓴다. */}
      {playerViews(hand, index).map(({ player, folded, isActor, stack, streetBet }) => {
        const speaking = isActor && current.audio.status === 'voice'
        return (
          <div
            className={[
              'replay-seat',
              `replay-seat--${player.position}`,
              folded ? 'is-folded' : '',
              isActor ? 'is-actor' : '',
            ].join(' ')}
            key={player.id}
          >
            <div aria-label={`${player.name}의 홀카드`} className="replay-seat-cards" role="group">
              <PlayingCard card={player.cards[0]} size="small" />
              <PlayingCard card={player.cards[1]} className="overlap" size="small" />
            </div>
            <div className="replay-seat-panel">
              <div className="replay-seat-name">
                <strong>{player.name}</strong>
                {player.badge ? <span className="replay-badge">{player.badge}</span> : null}
              </div>
              {stack !== undefined ? (
                <span
                  aria-label={`${player.name} 남은 칩 ${formatChips(stack)}${hand.bigBlind ? ` (${formatBb(stack, hand.bigBlind)})` : ''}`}
                  className="replay-seat-stack"
                >
                  {formatChips(stack)}
                  {hand.bigBlind ? <span className="replay-seat-bb">{formatBb(stack, hand.bigBlind)}</span> : null}
                </span>
              ) : null}
            </div>
            {streetBet > 0 ? <div className="bet-pill replay-bet-pill">{formatChips(streetBet)}</div> : null}
            {speaking ? (
              <span className="speaking-chip">
                <Speaker220Regular aria-hidden="true" />
                {playing ? '발화 재생 중' : `음성 ${current.audio.seconds}초`}
              </span>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
