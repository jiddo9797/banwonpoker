import type { BlindLevel } from './blinds'
import { createDeck } from './cards'
import type { Card } from './cards'
import { compareHands, evaluateBest, handName } from './evaluator'
import type { HandValue } from './evaluator'
import { buildPots, splitPot } from './pots'
import { shuffle } from './rng'
import type { Rng } from './rng'
import type {
  EngineError,
  EngineErrorCode,
  EngineEvent,
  EngineEventBody,
  EngineResult,
  HandPlayer,
  HandState,
  LegalActions,
  Player,
  PlayerAction,
  Street,
  TableState,
} from './types'

const chips = new Intl.NumberFormat('ko-KR')

/** 한 번의 API 호출 동안 상태를 고치고 이벤트를 모은다. 입력 상태는 건드리지 않는다. */
interface Context {
  table: TableState
  events: EngineEvent[]
}

function begin(table: TableState): Context {
  return { table: structuredClone(table), events: [] }
}

function emit(ctx: Context, body: EngineEventBody) {
  ctx.table.eventSeq += 1
  ctx.events.push({ ...body, seq: ctx.table.eventSeq } as EngineEvent)
}

function done(ctx: Context): EngineResult {
  return { ok: true, table: ctx.table, events: ctx.events }
}

function fail(code: EngineErrorCode, message: string): EngineResult {
  return { ok: false, error: { code, message } }
}

export interface CreateTableOptions {
  startingStack: number
  maxSeats?: number
}

export function createTable({ startingStack, maxSeats = 6 }: CreateTableOptions): TableState {
  return {
    maxSeats,
    startingStack,
    players: [],
    hand: null,
    handsPlayed: 0,
    lastDealerSeat: null,
    eventSeq: 0,
  }
}

function findPlayer(table: TableState, playerId: string) {
  return table.players.find((player) => player.id === playerId)
}

function handPlayer(hand: HandState, playerId: string) {
  return hand.players.find((player) => player.id === playerId)
}

function isHandInProgress(table: TableState) {
  return table.hand !== null && table.hand.phase !== 'complete'
}

/** 다음 핸드에 참여할 수 있는 참가자(좌석 순서) */
export function eligiblePlayers(table: TableState): Player[] {
  return table.players
    .filter((player) => player.status === 'active' && player.stack > 0)
    .sort((a, b) => a.seat - b.seat)
}

export function isGameOver(table: TableState) {
  return !isHandInProgress(table) && eligiblePlayers(table).length < 2
}

/** 테이블 위 전체 칩. 핸드 중에도 스택 + 낸 칩으로 항상 같아야 한다. */
export function totalChips(table: TableState) {
  const stacks = table.players.reduce((sum, player) => sum + player.stack, 0)
  const committed = isHandInProgress(table)
    ? (table.hand?.players.reduce((sum, player) => sum + player.totalCommitted, 0) ?? 0)
    : 0
  return stacks + committed
}

export interface SeatPlayerOptions {
  id: string
  name: string
  seat: number
  /** 기본값은 테이블의 시작 칩 */
  stack?: number
}

/** 참가자를 앉힌다. 핸드가 진행 중이면 다음 핸드부터 참여한다. */
export function seatPlayer(table: TableState, options: SeatPlayerOptions): EngineResult {
  if (findPlayer(table, options.id)?.status === 'active') return fail('DUPLICATE_PLAYER', '이미 앉아 있는 참가자입니다.')
  if (!Number.isInteger(options.seat) || options.seat < 0 || options.seat >= table.maxSeats) {
    return fail('SEAT_TAKEN', '없는 좌석입니다.')
  }
  const occupied = table.players.filter((player) => player.status === 'active')
  if (occupied.some((player) => player.seat === options.seat)) return fail('SEAT_TAKEN', '이미 누군가 앉은 좌석입니다.')
  if (occupied.length >= table.maxSeats) return fail('TABLE_FULL', '자리가 모두 찼습니다.')

  const ctx = begin(table)
  ctx.table.players = ctx.table.players.filter((player) => player.id !== options.id)
  ctx.table.players.push({
    id: options.id,
    name: options.name,
    seat: options.seat,
    stack: options.stack ?? table.startingStack,
    status: 'active',
  })
  emit(ctx, { type: 'player-joined', playerId: options.id, seat: options.seat, joinsNextHand: isHandInProgress(table) })
  return done(ctx)
}

/** 좌석 순서에서 `fromSeat` 다음부터 한 바퀴 도는 순서 */
function orderAfter<T extends { seat: number }>(items: T[], fromSeat: number): T[] {
  const sorted = [...items].sort((a, b) => a.seat - b.seat)
  const after = sorted.filter((item) => item.seat > fromSeat)
  const before = sorted.filter((item) => item.seat <= fromSeat)
  return [...after, ...before]
}

function canAct(player: HandPlayer) {
  return !player.folded && !player.allIn
}

function commit(ctx: Context, player: HandPlayer, amount: number) {
  const seated = findPlayer(ctx.table, player.id) as Player
  const paid = Math.min(Math.max(0, amount), seated.stack)
  seated.stack -= paid
  player.streetCommitted += paid
  player.totalCommitted += paid
  if (seated.stack === 0) player.allIn = true
  return paid
}

export interface StartHandOptions {
  blinds: BlindLevel
  rng: Rng
  /** 첫 핸드의 딜러 좌석. 없으면 가장 앞 좌석 */
  dealerSeat?: number
  /**
   * 섞지 않고 이 순서대로 나눠 준다. 테스트와 핸드 재현용이다.
   * 딜러 왼쪽부터 한 장씩 두 바퀴, 그다음 버림·플랍 3장·버림·턴·버림·리버 순서로 쓴다.
   */
  deck?: Card[]
}

export function startHand(table: TableState, { blinds, rng, dealerSeat, deck: fixedDeck }: StartHandOptions): EngineResult {
  if (isHandInProgress(table)) return fail('HAND_IN_PROGRESS', '진행 중인 핸드가 끝나야 합니다.')
  if (
    !Number.isInteger(blinds.smallBlind) ||
    !Number.isInteger(blinds.bigBlind) ||
    blinds.smallBlind < 1 ||
    blinds.bigBlind < blinds.smallBlind
  ) {
    return fail('INVALID_BLINDS', '블라인드 금액이 올바르지 않습니다.')
  }
  const eligible = eligiblePlayers(table)
  if (eligible.length < 2) return fail('NOT_ENOUGH_PLAYERS', '칩이 있는 참가자가 2명 이상이어야 합니다.')

  const ctx = begin(table)
  const dealer =
    table.lastDealerSeat === null
      ? (eligible.find((player) => player.seat === dealerSeat) ?? eligible[0])
      : orderAfter(eligible, table.lastDealerSeat)[0]
  const afterDealer = orderAfter(eligible, dealer.seat)
  // 헤즈업은 딜러가 스몰 블라인드를 낸다.
  const smallBlind = eligible.length === 2 ? dealer : afterDealer[0]
  const bigBlind = orderAfter(eligible, smallBlind.seat)[0]

  if (fixedDeck && (fixedDeck.length !== 52 || new Set(fixedDeck.map((card) => `${card.rank}${card.suit}`)).size !== 52)) {
    return fail('INVALID_DECK', '지정한 덱은 서로 다른 카드 52장이어야 합니다.')
  }
  const deck = fixedDeck ? fixedDeck.map((card) => ({ ...card })) : shuffle(createDeck(), rng)
  const dealOrder = orderAfter(eligible, dealer.seat)
  const holeCards = new Map<string, Card[]>(dealOrder.map((player) => [player.id, []]))
  for (let round = 0; round < 2; round += 1) {
    for (const player of dealOrder) holeCards.get(player.id)?.push(deck.shift() as Card)
  }

  const hand: HandState = {
    number: table.handsPlayed + 1,
    dealerSeat: dealer.seat,
    smallBlindSeat: smallBlind.seat,
    bigBlindSeat: bigBlind.seat,
    blinds: { ...blinds },
    deck,
    board: [],
    phase: 'preflop',
    players: eligible.map((player) => ({
      id: player.id,
      seat: player.seat,
      holeCards: holeCards.get(player.id) as [Card, Card],
      startingStack: player.stack,
      streetCommitted: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      mayRaise: true,
    })),
    toAct: null,
    currentBet: blinds.bigBlind,
    lastRaiseSize: blinds.bigBlind,
    lastActorSeat: bigBlind.seat,
    showdown: [],
    awards: [],
  }
  ctx.table.hand = hand

  emit(ctx, {
    type: 'hand-started',
    handNumber: hand.number,
    dealerSeat: hand.dealerSeat,
    smallBlindSeat: hand.smallBlindSeat,
    bigBlindSeat: hand.bigBlindSeat,
    blinds: { ...blinds },
    playerIds: hand.players.map((player) => player.id),
  })

  for (const [seat, blind, amount] of [
    [smallBlind.seat, 'small', blinds.smallBlind],
    [bigBlind.seat, 'big', blinds.bigBlind],
  ] as const) {
    const player = hand.players.find((item) => item.seat === seat) as HandPlayer
    const paid = commit(ctx, player, amount)
    emit(ctx, { type: 'blind-posted', playerId: player.id, blind, amount: paid, allIn: player.allIn })
  }

  emit(ctx, { type: 'hole-cards-dealt', handNumber: hand.number })
  progress(ctx)
  return done(ctx)
}

function isRoundComplete(hand: HandState) {
  const actionable = hand.players.filter(canAct)
  if (actionable.length === 0) return true
  // 행동할 수 있는 사람이 혼자면, 나머지(올인)가 낸 만큼 이미 맞췄을 때 더 베팅할 상대가 없다.
  if (actionable.length === 1) {
    const only = actionable[0]
    const others = hand.players.filter((player) => !player.folded && player.id !== only.id)
    const highestOther = Math.max(0, ...others.map((player) => player.streetCommitted))
    if (only.streetCommitted >= highestOther) return true
  }
  return actionable.every((player) => player.hasActed && player.streetCommitted === hand.currentBet)
}

function nextToAct(hand: HandState): HandPlayer | undefined {
  return orderAfter(hand.players, hand.lastActorSeat).find(
    (player) => canAct(player) && (!player.hasActed || player.streetCommitted < hand.currentBet),
  )
}

const nextStreet: Record<Exclude<Street, 'river'>, { street: Exclude<Street, 'preflop'>; cards: number }> = {
  preflop: { street: 'flop', cards: 3 },
  flop: { street: 'turn', cards: 1 },
  turn: { street: 'river', cards: 1 },
}

function dealNextStreet(ctx: Context, hand: HandState) {
  const current = hand.phase as Exclude<Street, 'river'>
  const { street, cards } = nextStreet[current]
  hand.deck.shift() // 버림 카드
  const dealt = hand.deck.splice(0, cards)
  hand.board.push(...dealt)
  hand.phase = street
  hand.currentBet = 0
  hand.lastRaiseSize = hand.blinds.bigBlind
  hand.lastActorSeat = hand.dealerSeat
  for (const player of hand.players) {
    player.streetCommitted = 0
    player.hasActed = false
    player.mayRaise = true
  }
  emit(ctx, { type: 'street-dealt', street, cards: dealt })
}

/** 액션 뒤에 핸드를 다음 상태로 진행한다: 다음 차례, 다음 스트리트, 올인 런아웃, 쇼다운, 정산. */
function progress(ctx: Context) {
  const hand = ctx.table.hand as HandState
  for (;;) {
    if (hand.players.filter((player) => !player.folded).length === 1) {
      finishHand(ctx, false)
      return
    }
    if (isRoundComplete(hand)) {
      if (hand.phase === 'river') {
        finishHand(ctx, true)
        return
      }
      dealNextStreet(ctx, hand)
      continue
    }
    const next = nextToAct(hand)
    if (!next) {
      // isRoundComplete가 거짓이면 행동할 사람이 반드시 있다.
      throw new Error('다음 차례를 찾지 못했습니다.')
    }
    hand.toAct = next.id
    emit(ctx, { type: 'turn-started', playerId: next.id, street: hand.phase as Street })
    return
  }
}

function finishHand(ctx: Context, showdown: boolean) {
  const table = ctx.table
  const hand = table.hand as HandState
  hand.toAct = null
  const live = hand.players.filter((player) => !player.folded)
  const values = new Map<string, HandValue>()

  if (showdown) {
    for (const player of live) values.set(player.id, evaluateBest([...player.holeCards, ...hand.board]))
    hand.showdown = orderAfter(live, hand.dealerSeat).map((player) => ({
      playerId: player.id,
      cards: player.holeCards,
      handName: handName(values.get(player.id) as HandValue),
    }))
    emit(ctx, { type: 'showdown', reveals: hand.showdown })
  }

  const pots = buildPots(
    hand.players.map((player) => ({ playerId: player.id, amount: player.totalCommitted, folded: player.folded })),
  )
  const seatOrder = orderAfter(hand.players, hand.dealerSeat).map((player) => player.id)

  pots.forEach((pot, potIndex) => {
    let winners = pot.eligible
    let name: string | undefined
    if (showdown && winners.length > 1) {
      const best = winners.reduce((top, id) =>
        compareHands(values.get(id) as HandValue, values.get(top) as HandValue) > 0 ? id : top,
      )
      const bestValue = values.get(best) as HandValue
      winners = winners.filter((id) => compareHands(values.get(id) as HandValue, bestValue) === 0)
    }
    if (showdown && winners.length > 0) name = handName(values.get(winners[0]) as HandValue)
    // 자격자가 없는 칩(이론상 없음)은 남은 사람에게 준다.
    if (winners.length === 0) winners = live.map((player) => player.id)

    const shares = splitPot(pot.amount, winners, seatOrder)
    for (const share of shares) (findPlayer(table, share.playerId) as Player).stack += share.amount
    const award = { potIndex, amount: pot.amount, winners: shares, handName: name }
    hand.awards.push(award)
    emit(ctx, { type: 'pot-awarded', award })
  })

  hand.phase = 'complete'
  table.lastDealerSeat = hand.dealerSeat
  table.handsPlayed = hand.number

  // 칩을 모두 잃은 사람은 탈락한다. 같은 핸드에서 여럿이 탈락하면 핸드를 시작할 때 칩이 많았던 사람이 순위가 높다.
  const busted = hand.players
    .filter((player) => (findPlayer(table, player.id) as Player).stack === 0)
    .sort((a, b) => b.startingStack - a.startingStack)
  const survivors = table.players.filter((player) => player.status === 'active' && player.stack > 0).length
  busted.forEach((player, index) => {
    const seated = findPlayer(table, player.id) as Player
    if (seated.status !== 'active') return
    seated.status = 'eliminated'
    seated.eliminatedAtHand = hand.number
    seated.place = survivors + index + 1
    emit(ctx, { type: 'player-eliminated', playerId: player.id, place: seated.place, handNumber: hand.number })
  })
  if (survivors === 1) {
    const champion = table.players.find((player) => player.status === 'active' && player.stack > 0) as Player
    champion.place = 1
  }

  emit(ctx, { type: 'hand-ended', handNumber: hand.number })
}

/** 지금 차례인 참가자가 할 수 있는 행동. 차례가 아니면 없다. */
export function legalActions(table: TableState, playerId: string): LegalActions | undefined {
  const hand = table.hand
  if (!hand || hand.phase === 'complete' || hand.toAct !== playerId) return undefined
  const player = handPlayer(hand, playerId) as HandPlayer
  const stack = (findPlayer(table, playerId) as Player).stack
  const toCall = Math.max(0, hand.currentBet - player.streetCommitted)
  const allInTo = player.streetCommitted + stack
  const canBet = hand.currentBet === 0 && stack > 0
  const canRaise = hand.currentBet > 0 && player.mayRaise && stack > toCall
  const minTo = canBet ? hand.blinds.bigBlind : hand.currentBet + hand.lastRaiseSize

  return {
    playerId,
    canFold: true,
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, stack),
    canBet,
    canRaise,
    minAmount: canBet || canRaise ? Math.min(minTo, allInTo) : 0,
    maxAmount: canBet || canRaise ? allInTo : 0,
  }
}

function validate(table: TableState, playerId: string, action: PlayerAction): EngineError | undefined {
  const hand = table.hand
  if (!hand || hand.phase === 'complete') return { code: 'NO_HAND', message: '진행 중인 핸드가 없습니다.' }
  if (!handPlayer(hand, playerId)) return { code: 'UNKNOWN_PLAYER', message: '이번 핸드에 참여하지 않았습니다.' }
  if (hand.toAct !== playerId) {
    const name = table.players.find((player) => player.id === hand.toAct)?.name ?? '다른 참가자'
    return { code: 'NOT_YOUR_TURN', message: `지금은 ${name} 차례입니다.` }
  }
  const legal = legalActions(table, playerId) as LegalActions

  switch (action.type) {
    case 'fold':
      return undefined
    case 'check':
      return legal.canCheck ? undefined : { code: 'ILLEGAL_ACTION', message: '베팅이 있어 체크할 수 없습니다.' }
    case 'call':
      return legal.callAmount > 0 ? undefined : { code: 'ILLEGAL_ACTION', message: '낼 금액이 없어 콜할 수 없습니다. 체크하세요.' }
    case 'bet':
    case 'raise': {
      const allowed = action.type === 'bet' ? legal.canBet : legal.canRaise
      if (!allowed) {
        const message =
          action.type === 'bet'
            ? '이미 베팅이 있어 레이즈해야 합니다.'
            : hand.currentBet === 0
              ? '베팅이 없어 베팅해야 합니다.'
              : '이번에는 레이즈할 수 없습니다. 콜하거나 폴드하세요.'
        return { code: 'ILLEGAL_ACTION', message }
      }
      if (!Number.isInteger(action.amount)) return { code: 'ILLEGAL_ACTION', message: '금액은 정수여야 합니다.' }
      if (action.amount > legal.maxAmount) {
        return { code: 'AMOUNT_TOO_LARGE', message: `최대 ${chips.format(legal.maxAmount)}까지 낼 수 있습니다.` }
      }
      if (action.amount < legal.minAmount) {
        const label = action.type === 'bet' ? '최소 베팅은' : '최소 레이즈는'
        return { code: 'AMOUNT_TOO_SMALL', message: `${label} ${chips.format(legal.minAmount)}입니다.` }
      }
      return undefined
    }
  }
}

function applyAction(ctx: Context, playerId: string, action: PlayerAction, timedOut: boolean) {
  const hand = ctx.table.hand as HandState
  const player = handPlayer(hand, playerId) as HandPlayer
  const street = hand.phase as Street
  let paid = 0

  if (action.type === 'fold') {
    player.folded = true
  } else if (action.type === 'call') {
    paid = commit(ctx, player, hand.currentBet - player.streetCommitted)
  } else if (action.type === 'bet' || action.type === 'raise') {
    const raiseSize = action.amount - hand.currentBet
    paid = commit(ctx, player, action.amount - player.streetCommitted)
    const fullRaise = raiseSize >= hand.lastRaiseSize
    if (fullRaise) hand.lastRaiseSize = raiseSize
    hand.currentBet = action.amount
    for (const other of hand.players) {
      if (other.id === player.id || !canAct(other)) continue
      other.hasActed = false
      // 모자란 올인 레이즈는 이미 행동한 사람에게 다시 레이즈할 기회를 주지 않는다.
      if (fullRaise) other.mayRaise = true
    }
  }

  player.hasActed = true
  player.mayRaise = false
  hand.lastActorSeat = player.seat
  hand.toAct = null
  emit(ctx, {
    type: 'action',
    playerId,
    street,
    action: action.type,
    amount: paid,
    to: player.streetCommitted,
    allIn: player.allIn,
    timedOut,
  })
}

/** 지금 차례인 참가자의 행동을 적용한다. */
export function act(table: TableState, playerId: string, action: PlayerAction): EngineResult {
  const error = validate(table, playerId, action)
  if (error) return { ok: false, error }
  const ctx = begin(table)
  applyAction(ctx, playerId, action, false)
  progress(ctx)
  return done(ctx)
}

/** 시간 초과(D4): 체크할 수 있으면 체크, 아니면 폴드한다. */
export function timeout(table: TableState): EngineResult {
  const hand = table.hand
  if (!hand || hand.phase === 'complete' || !hand.toAct) return fail('NO_HAND', '진행 중인 차례가 없습니다.')
  const legal = legalActions(table, hand.toAct) as LegalActions
  const ctx = begin(table)
  applyAction(ctx, hand.toAct, legal.canCheck ? { type: 'check' } : { type: 'fold' }, true)
  progress(ctx)
  return done(ctx)
}

/**
 * 테이블을 떠난다. 핸드에 참여 중이면 폴드 처리하고, 다음 핸드부터 빠진다.
 * 남은 칩은 기록을 위해 그대로 둔다.
 */
export function leaveTable(table: TableState, playerId: string): EngineResult {
  const seated = findPlayer(table, playerId)
  if (!seated || seated.status !== 'active') return fail('UNKNOWN_PLAYER', '테이블에 없는 참가자입니다.')
  const ctx = begin(table)
  const hand = ctx.table.hand
  const inHand = hand && hand.phase !== 'complete' ? handPlayer(hand, playerId) : undefined

  if (hand && inHand && !inHand.folded) {
    if (hand.toAct === playerId) {
      applyAction(ctx, playerId, { type: 'fold' }, false)
      progress(ctx)
    } else {
      inHand.folded = true
      inHand.hasActed = true
      emit(ctx, {
        type: 'action',
        playerId,
        street: hand.phase as Street,
        action: 'fold',
        amount: 0,
        to: inHand.streetCommitted,
        allIn: false,
        timedOut: false,
      })
      if (hand.players.filter((player) => !player.folded).length === 1) finishHand(ctx, false)
    }
  }

  ;(findPlayer(ctx.table, playerId) as Player).status = 'left'
  emit(ctx, { type: 'player-left', playerId })
  return done(ctx)
}

/**
 * 진행 중인 핸드를 무효로 한다. 이번 핸드에 낸 칩을 모두 돌려주고 핸드를 끝낸다.
 * 방장이 세션을 도중에 끝낼 때 쓴다.
 */
export function cancelHand(table: TableState): EngineResult {
  if (!isHandInProgress(table)) return fail('NO_HAND', '진행 중인 핸드가 없습니다.')
  const ctx = begin(table)
  const hand = ctx.table.hand as HandState
  for (const player of hand.players) {
    ;(findPlayer(ctx.table, player.id) as Player).stack += player.totalCommitted
    player.totalCommitted = 0
    player.streetCommitted = 0
  }
  hand.phase = 'complete'
  hand.toAct = null
  emit(ctx, { type: 'hand-cancelled', handNumber: hand.number })
  return done(ctx)
}
