import { Speaker220Regular } from '@fluentui/react-icons'
import { formatChips } from '../../../shared/format'
import { EmptyCardSlot, PlayingCard } from '../../table/components/PlayingCard'
import { streetLabels, visibleBoardCount } from '../fixtures'
import type { HandAction, ReplayHand, ReplayPlayer } from '../model'

interface PlayerView {
  player: ReplayPlayer
  lastAction?: HandAction
  folded: boolean
  isActor: boolean
}

function playerViews(hand: ReplayHand, index: number): PlayerView[] {
  const played = hand.actions.slice(0, index + 1)
  const current = hand.actions[index]

  return hand.players.map((player) => {
    const own = played.filter((action) => action.playerId === player.id)
    return {
      player,
      lastAction: own[own.length - 1],
      folded: own.some((action) => action.kind === 'fold'),
      isActor: current?.playerId === player.id,
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

      {playerViews(hand, index).map(({ player, lastAction, folded, isActor }) => {
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
              <span className="replay-seat-action">{folded ? '폴드' : (lastAction?.label ?? '대기')}</span>
            </div>
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
