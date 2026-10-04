import type { ReplayData, ReplayHandData } from '@banwonpoker/server/protocol'
import type { HandAction, ReplayHand, ReplayPlayer } from '../features/replay/model'
import type { SeatPosition } from '../features/table/model'
import { positionsFromButton } from '@banwonpoker/gto'
import { formatBb, formatChips } from '../shared/format'
import { toCard } from './adapt'

const layouts: Record<number, SeatPosition[]> = {
  2: ['top-center'],
  3: ['top-left', 'top-right'],
  4: ['bottom-left', 'top-center', 'bottom-right'],
  5: ['bottom-left', 'top-left', 'top-right', 'bottom-right'],
  6: ['bottom-left', 'top-left', 'top-center', 'top-right', 'bottom-right'],
}

function actionLabel(action: ReplayHandData['actions'][number], blindIndex: number, bigBlind: number) {
  const amount = `${formatChips(action.to)} (${formatBb(action.to, bigBlind)})`
  const allIn = action.allIn ? ' 올인' : ''
  switch (action.kind) {
    case 'blind':
      return `${blindIndex === 0 ? 'SB' : 'BB'} ${formatChips(action.amount)}`
    case 'check':
      return action.timedOut ? '체크(시간 초과)' : '체크'
    case 'call':
      return `콜 ${amount}${allIn}`
    case 'bet':
      return `베팅 ${amount}${allIn}`
    case 'raise':
      return `레이즈 ${amount}${allIn}`
    case 'fold':
      return action.timedOut ? '폴드(시간 초과)' : '폴드'
  }
}

/** 핸드 결과 문구. 예: `민수 승리 · 에이스 하이 플러시 +1,450` */
export function handResult(hand: ReplayHandData, nameOf: (id: string) => string) {
  if (hand.cancelled) return '무효 · 낸 칩을 모두 돌려받았습니다'
  const totals = new Map<string, number>()
  for (const award of hand.awards) {
    for (const winner of award.winners) totals.set(winner.playerId, (totals.get(winner.playerId) ?? 0) + winner.amount)
  }
  if (totals.size === 0) return '결과 없음'
  const names = [...totals.keys()].map(nameOf).join('·')
  const handName = hand.awards.find((award) => award.handName)?.handName
  const amount = totals.size === 1 ? ` +${formatChips([...totals.values()][0])}` : ''
  return `${names} 승리${handName ? ` · ${handName}` : ''}${amount}`
}

/** 서버 복기 데이터를 복기 화면이 쓰는 형태로 바꾼다. 내 좌석을 아래 가운데에 둔다. */
export function toReplayHands(replay: ReplayData, viewerId: string): ReplayHand[] {
  const maxSeats = replay.session.settings.maxPlayers
  const layout = layouts[maxSeats] ?? layouts[6]
  const nicknames = new Map(replay.participants.map((participant) => [participant.playerId, participant.nickname]))
  const nameOf = (id: string) => (id === viewerId ? '나' : (nicknames.get(id) ?? '알 수 없음'))

  return replay.hands
    .filter((hand) => hand.actions.length > 0)
    .map((hand) => {
      const mySeat = hand.players.find((player) => player.playerId === viewerId)?.seat
      const occupied = new Set(hand.players.map((player) => player.seat))
      const anchor = mySeat ?? Array.from({ length: maxSeats }, (_, seat) => seat).find((seat) => !occupied.has(seat)) ?? 0
      // 딜러부터 좌석 번호 순으로 돌며 포지션 이름을 붙인다(헤즈업은 딜러가 BTN이자 스몰 블라인드).
      const fromButton = [...hand.players].sort(
        (a, b) => ((a.seat - hand.dealerSeat + maxSeats) % maxSeats) - ((b.seat - hand.dealerSeat + maxSeats) % maxSeats),
      )
      const names = hand.players.length >= 2 && hand.players.length <= 6 ? positionsFromButton(hand.players.length) : []
      const positionOf = new Map(fromButton.map((player, index) => [player.playerId, names[index]]))

      const players: ReplayPlayer[] = hand.players.map((player) => {
        const offset = (player.seat - anchor + maxSeats) % maxSeats
        return {
          id: player.playerId,
          name: nameOf(player.playerId),
          position: player.playerId === viewerId ? 'hero' : (layout[offset - 1] ?? 'top-center'),
          cards: [toCard(player.cards[0]), toCard(player.cards[1])],
          badge: positionOf.get(player.playerId),
        }
      })

      let blindIndex = 0
      const actions: HandAction[] = hand.actions.map((action) => {
        const label = actionLabel(action, blindIndex, hand.blinds.bigBlind)
        if (action.kind === 'blind') blindIndex += 1
        return {
          id: `h${hand.number}-${action.seq}`,
          street: action.street,
          playerId: action.playerId,
          kind: action.kind,
          label,
          pot: action.pot,
          added: action.amount,
          thinkSeconds: action.thinkMs === null ? undefined : Math.max(1, Math.round(action.thinkMs / 1_000)),
          audio: {
            status: action.audio.status,
            seconds: action.audio.durationMs === null ? undefined : Math.max(1, Math.round(action.audio.durationMs / 1_000)),
          },
          turnSeq: action.turnSeq ?? undefined,
        }
      })

      const result = handResult(hand, nameOf)
      actions.push({
        id: `h${hand.number}-result`,
        street: 'showdown',
        kind: 'result',
        label: hand.cancelled ? '무효' : result.split(' · ')[0],
        pot: hand.actions.at(-1)?.pot ?? 0,
        added: 0,
        audio: { status: 'none' },
      })

      const startStacks: Record<string, number> = {}
      for (const player of hand.players) {
        startStacks[player.playerId] = player.startStack
      }
      // 무효 핸드는 낸 칩을 그대로 돌려받는다.
      const payouts: Record<string, number> = {}
      if (hand.cancelled) {
        for (const action of hand.actions) payouts[action.playerId] = (payouts[action.playerId] ?? 0) + action.amount
      } else {
        for (const award of hand.awards) {
          for (const winner of award.winners) payouts[winner.playerId] = (payouts[winner.playerId] ?? 0) + winner.amount
        }
      }

      return {
        number: hand.number,
        board: hand.board.map(toCard),
        players,
        actions,
        result,
        startStacks,
        payouts,
        bigBlind: hand.blinds.bigBlind,
      }
    })
}
