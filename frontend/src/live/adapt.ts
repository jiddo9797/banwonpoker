import type { Card as EngineCard, HandPhase, LegalActions, SeatView } from '@banwonpoker/engine'
import type { ClientState, ParticipantSnapshot, TimedEvent } from '@banwonpoker/server/protocol'
import { formatChips } from '../shared/format'
import type { LobbyParticipant } from '../features/lobby/fixtures'
import type { ActionOption, Card, Seat, SeatPosition, TableSnapshot } from '../features/table/model'
import type { ActionSlot, ConnectionStatus } from './client'

const rankLabels: Record<number, string> = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }

export function toCard(card: EngineCard): Card {
  return { rank: rankLabels[card.rank] ?? String(card.rank), suit: card.suit }
}

const suitSymbols: Record<EngineCard['suit'], string> = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }

function cardText(card: EngineCard) {
  return `${toCard(card).rank}${suitSymbols[card.suit]}`
}

/** 받침이 있으면 true. 조사(이/가, 으로/로)를 고를 때 쓴다. */
function hasBatchim(word: string) {
  const last = word.trim().at(-1)
  if (!last) return false
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  // 숫자: 0(영)·1(일)·3(삼)·6(육)·7(칠)·8(팔)은 받침이 있다.
  return '013678'.includes(last)
}

const subject = (name: string) => `${name}${hasBatchim(name) ? '이' : '가'}`

/** 금액 뒤 '으로/로'. ㄹ 받침(1·7·8)은 '로' */
function toward(amountText: string) {
  const last = amountText.at(-1) ?? ''
  return '036'.includes(last) ? '으로' : '로'
}

const streetNames: Record<HandPhase, string> = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
  complete: '결과',
}

/** 로그 한 줄. 스펙 형식: `민수가 300 콜`, `수빈이 900으로 레이즈`, `서준 300 베팅`, `지훈 폴드` */
export function formatEvent(event: TimedEvent, nameOf: (id: string) => string): string | null {
  switch (event.type) {
    case 'hand-started':
      return `핸드 #${event.handNumber} 시작 · 블라인드 ${formatChips(event.blinds.smallBlind)} / ${formatChips(event.blinds.bigBlind)}`
    case 'action': {
      const name = nameOf(event.playerId)
      const amount = formatChips(event.to)
      const suffix = `${event.allIn ? ' · 올인' : ''}${event.timedOut ? ' · 시간 초과' : ''}`
      switch (event.action) {
        case 'fold':
          return `${name} 폴드${suffix}`
        case 'check':
          return `${name} 체크${suffix}`
        case 'call':
          return `${subject(name)} ${amount} 콜${suffix}`
        case 'bet':
          return `${name} ${amount} 베팅${suffix}`
        case 'raise':
          return `${subject(name)} ${amount}${toward(amount)} 레이즈${suffix}`
      }
      return null
    }
    case 'street-dealt':
      return `${streetNames[event.street]} ${event.cards.map(cardText).join(' ')}`
    case 'pot-awarded': {
      const winners = event.award.winners.map((winner) => `${nameOf(winner.playerId)} +${formatChips(winner.amount)}`).join(', ')
      return `${winners}${event.award.handName ? ` · ${event.award.handName}` : ''}`
    }
    case 'player-eliminated':
      return `${nameOf(event.playerId)} 탈락 · ${event.place}위`
    case 'hand-cancelled':
      return `핸드 #${event.handNumber} 무효 · 낸 칩을 돌려받았습니다`
    default:
      return null
  }
}

/** 최대 인원별로, 나를 기준으로 시계 방향 n번째 좌석을 화면 어디에 둘지 */
const layouts: Record<number, SeatPosition[]> = {
  2: ['top-center'],
  3: ['top-left', 'top-right'],
  4: ['bottom-left', 'top-center', 'bottom-right'],
  5: ['bottom-left', 'top-left', 'top-right', 'bottom-right'],
  6: ['bottom-left', 'top-left', 'top-center', 'top-right', 'bottom-right'],
}

export function connectionOf(status: ConnectionStatus): TableSnapshot['connection'] {
  if (status === 'open') return 'connected'
  if (status === 'connecting' || status === 'reconnecting') return 'reconnecting'
  return 'disconnected'
}

function badgeOf(seat: SeatView): 'D' | 'SB' | 'BB' | undefined {
  if (seat.isDealer) return 'D'
  if (seat.isSmallBlind) return 'SB'
  if (seat.isBigBlind) return 'BB'
  return undefined
}

function waitingActions(detail: string): ActionOption[] {
  return [
    { id: 'call', label: '콜', detail, enabled: false, tone: 'neutral' },
    { id: 'raise', label: '레이즈', detail, enabled: false, tone: 'accent' },
    { id: 'check', label: '체크', detail, enabled: false, tone: 'neutral' },
    { id: 'fold', label: '폴드', detail, enabled: false, tone: 'danger' },
  ]
}

/** 네 칸 고정(콜·레이즈·체크·폴드, D3). 할 수 없는 칸은 자리를 지키고 이유를 보여준다. */
export function actionOptions(legal: LegalActions, heroStack: number): ActionOption[] {
  const canBetOrRaise = legal.canBet || legal.canRaise
  return [
    {
      id: 'call',
      label: '콜',
      detail: legal.callAmount > 0 ? `${formatChips(legal.callAmount)}${legal.callAmount >= heroStack ? ' · 올인' : ''}` : '낼 금액 없음',
      enabled: legal.callAmount > 0,
      tone: 'neutral',
    },
    {
      id: 'raise',
      label: legal.canBet ? '베팅' : '레이즈',
      detail: canBetOrRaise ? `최소 ${formatChips(legal.minAmount)}` : legal.callAmount >= heroStack ? '칩이 모자라 불가' : '이번에는 불가',
      enabled: canBetOrRaise,
      tone: 'accent',
    },
    {
      id: 'check',
      label: '체크',
      detail: legal.canCheck ? '베팅 없이 넘기기' : '베팅이 있어 불가',
      enabled: legal.canCheck,
      tone: 'neutral',
    },
    { id: 'fold', label: '폴드', detail: '핸드 포기', enabled: legal.canFold, tone: 'danger' },
  ]
}

/** 슬롯과 금액을 서버에 보낼 액션으로 바꾼다. */
export function toPlayerAction(slot: ActionSlot, legal: LegalActions, amount: number) {
  if (slot === 'raise') return { type: legal.canBet ? ('bet' as const) : ('raise' as const), amount }
  return { type: slot }
}

export function toLobbyParticipants(participants: ParticipantSnapshot[], selfId: string): LobbyParticipant[] {
  return participants
    .filter((participant) => participant.id !== selfId && participant.status !== 'left')
    .map((participant) => ({
      id: participant.id,
      name: participant.nickname,
      seatNumber: participant.seat === null ? undefined : participant.seat + 1,
      ready: participant.ready,
      connection: participant.connected ? 'connected' : 'disconnected',
      isHost: participant.isHost,
    }))
}

export interface AdaptOptions {
  /** 서버 기준 현재 시각 */
  now: number
  status: ConnectionStatus
  pendingSlot?: ActionSlot
}

/** 서버가 보낸 상태를 기존 테이블 화면이 쓰는 TableSnapshot으로 바꾼다. */
export function toTableSnapshot(state: ClientState, events: TimedEvent[], { now, status }: AdaptOptions): TableSnapshot {
  const game = state.game
  if (!game) throw new Error('게임이 시작되지 않았습니다.')
  const { view } = game
  const participants = new Map(state.room.participants.map((participant) => [participant.id, participant]))
  const nameOf = (id: string) => participants.get(id)?.nickname ?? view.seats.find((seat) => seat.id === id)?.name ?? '알 수 없음'
  const phase = view.phase ?? 'complete'
  const complete = phase === 'complete'
  const maxSeats = state.room.settings.maxPlayers

  // 같은 좌석에 탈락자와 새 참가자가 겹치면 참가 중인 사람만 그린다.
  const activeSeatNumbers = new Set(view.seats.filter((seat) => seat.status === 'active').map((seat) => seat.seat))
  const visible = view.seats.filter((seat) => seat.status === 'active' || !activeSeatNumbers.has(seat.seat))
  const me = visible.find((seat) => seat.id === state.you.playerId && seat.status === 'active')

  // 내 좌석을 항상 아래 가운데에 둔다. 관전 중이면 빈 좌석 하나를 기준으로 삼는다.
  const occupied = new Set(visible.map((seat) => seat.seat))
  const anchor = me?.seat ?? Array.from({ length: maxSeats }, (_, index) => index).find((seat) => !occupied.has(seat)) ?? 0
  const layout = layouts[maxSeats] ?? layouts[6]

  const remainingSeconds = game.turn ? Math.max(0, Math.ceil((game.turn.deadline - now) / 1_000)) : undefined
  const revealed = new Map(view.showdown.map((reveal) => [reveal.playerId, reveal.handName]))
  const winnings = new Map<string, number>()
  for (const award of view.awards) {
    for (const winner of award.winners) winnings.set(winner.playerId, (winnings.get(winner.playerId) ?? 0) + winner.amount)
  }

  const seats: Seat[] = visible
    .filter((seat) => seat.id !== me?.id)
    .map((seat) => {
      const offset = (seat.seat - anchor + maxSeats) % maxSeats
      const position = layout[offset - 1] ?? layouts[6][Math.max(0, offset - 1) % 5]
      const participant = participants.get(seat.id)
      const inHand = seat.inHand || (complete && seat.holeCards !== null)
      const isTurn = view.toAct === seat.id
      const status: Seat['status'] =
        seat.status === 'eliminated'
          ? 'eliminated'
          : participant && !participant.connected
            ? 'disconnected'
            : seat.folded
              ? 'folded'
              : seat.allIn
                ? 'all-in'
                : 'active'
      const waiting = !complete && !seat.inHand && seat.status === 'active'
      return {
        id: seat.id,
        name: seat.name,
        stack: seat.stack,
        position,
        badge: badgeOf(seat),
        bet: seat.streetCommitted || undefined,
        status,
        isTurn,
        remainingSeconds: isTurn ? remainingSeconds : undefined,
        showdownCards: seat.holeCards ? [toCard(seat.holeCards[0]), toCard(seat.holeCards[1])] : undefined,
        handRank: revealed.get(seat.id),
        isWinner: complete && winnings.has(seat.id),
        inHand,
        statusNote: waiting ? '다음 핸드부터' : undefined,
      }
    })

  const legal = view.legal
  const heroStack = me?.stack ?? 0
  const toActName = view.toAct ? nameOf(view.toAct) : undefined
  const nextHandSeconds = game.nextHandAt ? Math.max(0, Math.ceil((game.nextHandAt - now) / 1_000)) : undefined

  let actions: ActionOption[]
  let actionHint: string
  if (legal) {
    actions = actionOptions(legal, heroStack)
    actionHint = '액션과 베팅 금액을 선택하세요'
  } else if (complete) {
    actions = waitingActions('다음 핸드 준비 중')
    actionHint = nextHandSeconds !== undefined ? `다음 핸드가 ${nextHandSeconds}초 뒤 시작됩니다` : '다음 핸드 준비 중'
  } else if (!me) {
    actions = waitingActions('관전 중')
    actionHint = '관전 중입니다'
  } else if (!me.inHand) {
    actions = waitingActions('다음 핸드부터')
    actionHint = '다음 핸드부터 참여합니다'
  } else {
    actions = waitingActions('내 차례에 사용 가능')
    actionHint = toActName ? `${toActName} 차례를 기다리는 중` : '차례를 기다리는 중'
  }

  const pots = complete && view.awards.length > 0
    ? view.awards.map((award, index) => ({ label: view.awards.length > 1 ? (index === 0 ? '메인 팟' : `사이드 팟 ${index}`) : '팟', amount: award.amount }))
    : [{ label: '팟', amount: view.potTotal }]

  let tableMessage: string | undefined
  if (complete && winnings.size > 0) {
    const names = [...winnings.keys()].map((id) => (id === state.you.playerId ? '나' : nameOf(id)))
    const handName = view.awards[0]?.handName
    const total = winnings.size === 1 ? ` +${formatChips([...winnings.values()][0])}` : ''
    tableMessage = `${names.join('·')} 승리${handName ? ` · ${handName}` : ''}${total}`
  }

  const board = Array.from({ length: 5 }, (_, index) => (view.board[index] ? toCard(view.board[index]) : null)) as TableSnapshot['board']

  const logs = events
    .map((event) => formatEvent(event, (id) => (id === state.you.playerId ? '나' : nameOf(id))))
    .filter((line): line is string => line !== null)
    .reverse()
    .slice(0, 30)

  const waiting = state.room.participants.filter(
    (participant) => participant.status === 'lobby' && participant.id !== state.you.playerId,
  )
  const waitingPlayers = waiting.map((participant) => participant.nickname)

  return {
    key: 'my',
    label: '',
    description: '',
    handNumber: view.handNumber ?? 0,
    gameType: '노리밋 홀덤',
    smallBlind: game.blinds.level.smallBlind,
    bigBlind: game.blinds.level.bigBlind,
    street: streetNames[phase],
    board,
    pots,
    seats,
    heroId: state.you.playerId,
    heroCards: me?.holeCards && (me.inHand || complete) ? [toCard(me.holeCards[0]), toCard(me.holeCards[1])] : null,
    heroBadge: (me && badgeOf(me)) ?? 'none',
    heroStack,
    heroBet: me?.streetCommitted || undefined,
    heroRemainingSeconds: me && view.toAct === me.id ? remainingSeconds : undefined,
    heroIsWinner: complete && winnings.has(state.you.playerId),
    recordingState: 'hidden',
    actionHint,
    actions,
    callAmount: legal?.callAmount ?? 0,
    minRaise: legal?.minAmount ?? 0,
    maxRaise: legal?.maxAmount ?? 0,
    selectedBetAmount: legal?.minAmount ?? 0,
    tableMessage,
    logs,
    waitingPlayers: waitingPlayers.length > 0 ? waitingPlayers : undefined,
    waitingPlayerIds: waiting.length > 0 ? waiting.map((participant) => participant.id) : undefined,
    connection: connectionOf(status),
  }
}

/** 테이블 헤더의 다음 블라인드 레벨 안내 */
export function blindNoteOf(state: ClientState, now: number) {
  const blinds = state.game?.blinds
  if (!blinds?.nextLevel || !blinds.nextLevelAt) return undefined
  const minutes = Math.max(1, Math.ceil((blinds.nextLevelAt - now) / 60_000))
  return `레벨 ${blinds.levelIndex + 1} · ${minutes}분 뒤 ${formatChips(blinds.nextLevel.smallBlind)} / ${formatChips(blinds.nextLevel.bigBlind)}`
}
