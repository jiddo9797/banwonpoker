import { describe, expect, it } from 'vitest'
import { cardCode } from './cards'
import { seededRng } from './rng'
import { act, cancelHand, isGameOver, leaveTable, legalActions, seatPlayer, startHand, timeout, totalChips } from './table'
import { blinds, rng, stackedDeck, tableWith, unwrap } from './testing'
import type { EngineEvent, PlayerAction, TableState } from './types'
import { playerView } from './view'

function start(table: TableState, options: Partial<Parameters<typeof startHand>[1]> = {}) {
  return unwrap(startHand(table, { blinds, rng, ...options }))
}

function play(table: TableState, playerId: string, action: PlayerAction) {
  return unwrap(act(table, playerId, action)).table
}

function stackOf(table: TableState, id: string) {
  return table.players.find((player) => player.id === id)?.stack
}

function eventTypes(events: EngineEvent[]) {
  return events.map((event) => event.type)
}

describe('seatPlayer', () => {
  it('같은 사람, 찬 좌석, 없는 좌석, 가득 찬 테이블을 거부한다', () => {
    const table = tableWith(['a', 'b'])
    expect(seatPlayer(table, { id: 'a', name: 'a', seat: 3 })).toMatchObject({ ok: false, error: { code: 'DUPLICATE_PLAYER' } })
    expect(seatPlayer(table, { id: 'c', name: 'c', seat: 1 })).toMatchObject({ ok: false, error: { code: 'SEAT_TAKEN' } })
    expect(seatPlayer(table, { id: 'c', name: 'c', seat: 6 })).toMatchObject({ ok: false, error: { code: 'SEAT_TAKEN' } })
    const full = tableWith(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(seatPlayer(full, { id: 'g', name: 'g', seat: 0 }).ok).toBe(false)
  })

  it('기본 칩은 테이블의 시작 칩이다', () => {
    expect(stackOf(tableWith(['a']), 'a')).toBe(10_000)
  })
})

describe('startHand', () => {
  it('참가자가 2명보다 적거나 블라인드·덱이 잘못되면 시작하지 않는다', () => {
    expect(startHand(tableWith(['a']), { blinds, rng })).toMatchObject({ ok: false, error: { code: 'NOT_ENOUGH_PLAYERS' } })
    expect(startHand(tableWith(['a', 'b']), { blinds: { smallBlind: 0, bigBlind: 100 }, rng }).ok).toBe(false)
    expect(startHand(tableWith(['a', 'b']), { blinds, rng, deck: [] })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_DECK' },
    })
  })

  it('3명 이상이면 딜러 왼쪽이 스몰, 그다음이 빅 블라인드, 그다음부터 행동한다', () => {
    const { table, events } = start(tableWith(['a', 'b', 'c', 'd']))
    const hand = table.hand!
    expect([hand.dealerSeat, hand.smallBlindSeat, hand.bigBlindSeat]).toEqual([0, 1, 2])
    expect(hand.toAct).toBe('d')
    expect(stackOf(table, 'b')).toBe(9_950)
    expect(stackOf(table, 'c')).toBe(9_900)
    expect(eventTypes(events)).toEqual(['hand-started', 'blind-posted', 'blind-posted', 'hole-cards-dealt', 'turn-started'])
  })

  it('모두에게 서로 다른 카드 두 장을 준다', () => {
    const { table } = start(tableWith(['a', 'b', 'c', 'd', 'e', 'f']))
    const cards = table.hand!.players.flatMap((player) => player.holeCards.map(cardCode))
    expect(cards).toHaveLength(12)
    expect(new Set(cards).size).toBe(12)
    expect(table.hand!.deck).toHaveLength(40)
  })

  it('헤즈업은 딜러가 스몰 블라인드를 내고 프리플랍에 먼저, 플랍부터는 나중에 행동한다', () => {
    let table = start(tableWith(['a', 'b'])).table
    expect(table.hand).toMatchObject({ dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1, toAct: 'a' })
    table = play(table, 'a', { type: 'call' })
    table = play(table, 'b', { type: 'check' })
    expect(table.hand).toMatchObject({ phase: 'flop', toAct: 'b' })
  })

  it('딜러는 핸드마다 칩이 있는 다음 사람에게 넘어간다', () => {
    let table = tableWith(['a', 'b', 'c'])
    const dealers: number[] = []
    for (let hand = 0; hand < 4; hand += 1) {
      table = start(table).table
      dealers.push(table.hand!.dealerSeat)
      // 차례인 사람이 계속 폴드해 핸드를 끝낸다.
      while (table.hand!.phase !== 'complete') table = play(table, table.hand!.toAct!, { type: 'fold' })
    }
    expect(dealers).toEqual([0, 1, 2, 0])

    // 좌석 1이 탈락했다면 건너뛴다.
    const skipped = structuredClone(table)
    skipped.players[1].status = 'eliminated'
    expect(start(skipped).table.hand!.dealerSeat).toBe(2)
  })
})

describe('베팅 규칙', () => {
  it('차례가 아니거나, 베팅이 있는데 체크하거나, 금액이 범위를 벗어나면 거부한다', () => {
    const table = start(tableWith(['a', 'b', 'c'])).table
    expect(act(table, 'b', { type: 'fold' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN', message: '지금은 a 차례입니다.' },
    })
    expect(act(table, 'a', { type: 'check' })).toMatchObject({
      ok: false,
      error: { message: '베팅이 있어 체크할 수 없습니다.' },
    })
    expect(act(table, 'a', { type: 'bet', amount: 300 })).toMatchObject({ ok: false, error: { code: 'ILLEGAL_ACTION' } })
    expect(act(table, 'a', { type: 'raise', amount: 150 })).toMatchObject({
      ok: false,
      error: { code: 'AMOUNT_TOO_SMALL', message: '최소 레이즈는 200입니다.' },
    })
    expect(act(table, 'a', { type: 'raise', amount: 10_001 })).toMatchObject({
      ok: false,
      error: { code: 'AMOUNT_TOO_LARGE', message: '최대 10,000까지 낼 수 있습니다.' },
    })
    expect(act(table, 'a', { type: 'raise', amount: 250.5 }).ok).toBe(false)
    expect(act(table, 'ghost', { type: 'fold' })).toMatchObject({ ok: false, error: { code: 'UNKNOWN_PLAYER' } })
  })

  it('레이즈한 만큼이 다음 최소 레이즈 폭이 된다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    expect(legalActions(table, 'a')).toMatchObject({ callAmount: 100, canRaise: true, minAmount: 200, maxAmount: 10_000 })
    table = play(table, 'a', { type: 'raise', amount: 300 })
    // 50을 이미 낸 스몰 블라인드: 콜 250, 최소 레이즈 300 + 200 = 500
    expect(legalActions(table, 'b')).toMatchObject({ callAmount: 250, minAmount: 500 })
    expect(legalActions(table, 'a')).toBeUndefined()
  })

  it('모두 콜하면 빅 블라인드는 체크하거나 레이즈할 수 있고, 체크하면 플랍이 열린다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    table = play(table, 'a', { type: 'call' })
    table = play(table, 'b', { type: 'call' })
    expect(legalActions(table, 'c')).toMatchObject({ canCheck: true, callAmount: 0, canRaise: true, minAmount: 200 })

    const result = unwrap(act(table, 'c', { type: 'check' }))
    expect(result.table.hand).toMatchObject({ phase: 'flop', currentBet: 0, toAct: 'b' })
    expect(result.table.hand!.board).toHaveLength(3)
    expect(eventTypes(result.events)).toEqual(['action', 'street-dealt', 'turn-started'])
  })

  it('플랍에서는 베팅(bet)을 하고, 최소 베팅은 빅 블라인드다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    table = play(table, 'a', { type: 'call' })
    table = play(table, 'b', { type: 'call' })
    table = play(table, 'c', { type: 'check' })
    expect(legalActions(table, 'b')).toMatchObject({ canCheck: true, canBet: true, canRaise: false, minAmount: 100 })
    expect(act(table, 'b', { type: 'raise', amount: 300 })).toMatchObject({ ok: false, error: { message: '베팅이 없어 베팅해야 합니다.' } })
    expect(act(table, 'b', { type: 'bet', amount: 50 })).toMatchObject({ ok: false, error: { message: '최소 베팅은 100입니다.' } })
    table = play(table, 'b', { type: 'bet', amount: 300 })
    expect(legalActions(table, 'c')).toMatchObject({ callAmount: 300, minAmount: 600 })
  })

  it('모자란 올인 레이즈는 이미 행동한 사람에게 레이즈 기회를 다시 주지 않는다', () => {
    // 딜러 d(450칩), 스몰 s, 빅 b, 언더더건 u
    let table = start(tableWith(['d', 's', 'b', 'u'], [450, 10_000, 10_000, 10_000])).table
    table = play(table, 'u', { type: 'raise', amount: 300 })
    expect(legalActions(table, 'd')).toMatchObject({ canRaise: true, minAmount: 450, maxAmount: 450 })
    table = play(table, 'd', { type: 'raise', amount: 450 }) // 150만 올린 올인: 최소 폭 200에 못 미침
    // 아직 행동하지 않은 블라인드는 레이즈할 수 있다.
    expect(legalActions(table, 's')).toMatchObject({ canRaise: true, minAmount: 650 })
    table = play(table, 's', { type: 'fold' })
    table = play(table, 'b', { type: 'fold' })
    expect(legalActions(table, 'u')).toMatchObject({ canRaise: false, callAmount: 150 })
    expect(act(table, 'u', { type: 'raise', amount: 1_000 })).toMatchObject({ ok: false, error: { code: 'ILLEGAL_ACTION' } })
  })

  it('충분한 레이즈는 이미 행동한 사람에게도 다시 레이즈 기회를 준다', () => {
    let table = start(tableWith(['d', 's', 'b', 'u'], [1_000, 10_000, 10_000, 10_000])).table
    table = play(table, 'u', { type: 'raise', amount: 300 })
    table = play(table, 'd', { type: 'raise', amount: 600 })
    table = play(table, 's', { type: 'fold' })
    table = play(table, 'b', { type: 'fold' })
    expect(legalActions(table, 'u')).toMatchObject({ canRaise: true, callAmount: 300, minAmount: 900 })
  })
})

describe('핸드 정산', () => {
  it('모두 폴드하면 남은 사람이 쇼다운 없이 팟을 가져간다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    table = play(table, 'a', { type: 'fold' })
    const result = unwrap(act(table, 'b', { type: 'fold' }))
    expect(result.table.hand).toMatchObject({ phase: 'complete', toAct: null, showdown: [] })
    expect(eventTypes(result.events)).toEqual(['action', 'pot-awarded', 'hand-ended'])
    expect(result.table.hand!.awards).toEqual([{ potIndex: 0, amount: 150, winners: [{ playerId: 'c', amount: 150 }] }])
    expect([stackOf(result.table, 'a'), stackOf(result.table, 'b'), stackOf(result.table, 'c')]).toEqual([
      10_000, 9_950, 10_050,
    ])
  })

  it('쇼다운에서 더 좋은 패가 이기고 족보를 공개한다', () => {
    // 딜러 a, 나눠 주는 순서 b → c → a
    const deck = stackedDeck(['Ah Kh', '7c 7d', '2s 3d'], 'Ks 9h 4h 2c Jh')
    let table = start(tableWith(['a', 'b', 'c']), { deck }).table
    table = play(table, 'a', { type: 'call' })
    table = play(table, 'b', { type: 'call' })
    table = play(table, 'c', { type: 'check' })
    for (let street = 0; street < 3; street += 1) {
      for (const id of ['b', 'c', 'a']) table = play(table, id, { type: 'check' })
    }
    const hand = table.hand!
    expect(hand.phase).toBe('complete')
    expect(hand.showdown.map((reveal) => [reveal.playerId, reveal.handName])).toEqual([
      ['b', '에이스 하이 플러시'],
      ['c', '세븐 원 페어'],
      ['a', '투 원 페어'],
    ])
    expect(hand.awards).toEqual([
      { potIndex: 0, amount: 300, winners: [{ playerId: 'b', amount: 300 }], handName: '에이스 하이 플러시' },
    ])
    expect(stackOf(table, 'b')).toBe(10_200)
  })

  it('같은 패면 팟을 나누고, 남는 칩은 딜러 왼쪽에 가까운 사람에게 준다', () => {
    // 보드가 로열 플러시라 남은 두 사람이 비긴다.
    const deck = stackedDeck(['2c 3d', '4c 5d', '6c 7d'], 'As Ks Qs Js Ts')
    let table = start(tableWith(['a', 'b', 'c']), { deck, blinds: { smallBlind: 25, bigBlind: 50 } }).table
    table = play(table, 'a', { type: 'call' })
    table = play(table, 'b', { type: 'fold' })
    table = play(table, 'c', { type: 'check' })
    for (let street = 0; street < 3; street += 1) for (const id of ['c', 'a']) table = play(table, id, { type: 'check' })

    // 팟 125 = 스몰 25 + 50 + 50. 딜러 a 다음 순서는 b(폴드) → c → a
    expect(table.hand!.awards[0]).toEqual({
      potIndex: 0,
      amount: 125,
      winners: [
        { playerId: 'c', amount: 63 },
        { playerId: 'a', amount: 62 },
      ],
      handName: '로열 플러시',
    })
  })

  it('올인 금액이 다르면 사이드 팟으로 나누고 남은 카드를 자동으로 연다', () => {
    // 딜러 a(10,000), 스몰 b(1,000), 빅 c(3,000). 순서 b → c → a
    const deck = stackedDeck(['Ah Ad', 'Kh Kd', '7c 2d'], '2c 5d 9h Js 3s')
    let table = start(tableWith(['a', 'b', 'c'], [10_000, 1_000, 3_000]), { deck }).table
    table = play(table, 'a', { type: 'raise', amount: 10_000 })
    table = play(table, 'b', { type: 'call' })
    const result = unwrap(act(table, 'c', { type: 'call' }))
    table = result.table

    expect(eventTypes(result.events).filter((type) => type === 'street-dealt')).toHaveLength(3)
    expect(eventTypes(result.events)).not.toContain('turn-started')
    expect(table.hand!.board.map(cardCode)).toEqual(['2c', '5d', '9h', 'Js', '3s'])
    expect(table.hand!.awards.map((award) => [award.amount, award.winners])).toEqual([
      [3_000, [{ playerId: 'b', amount: 3_000 }]],
      [4_000, [{ playerId: 'c', amount: 4_000 }]],
      [7_000, [{ playerId: 'a', amount: 7_000 }]],
    ])
    expect([stackOf(table, 'a'), stackOf(table, 'b'), stackOf(table, 'c')]).toEqual([7_000, 3_000, 4_000])
  })

  it('헤즈업에서 빅 블라인드가 모자란 칩으로 올인하면 스몰은 더 낼 필요 없이 바로 연다', () => {
    const table = start(tableWith(['a', 'b'], [10_000, 40])).table
    expect(table.hand!.phase).toBe('complete')
    expect(table.hand!.board).toHaveLength(5)
    expect(totalChips(table)).toBe(10_040)
  })
})

describe('시간 초과(D4)', () => {
  it('체크할 수 있으면 체크, 아니면 폴드한다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    let result = unwrap(timeout(table))
    expect(result.events[0]).toMatchObject({ type: 'action', playerId: 'a', action: 'fold', timedOut: true })

    table = play(result.table, 'b', { type: 'call' })
    result = unwrap(timeout(table))
    expect(result.events[0]).toMatchObject({ type: 'action', playerId: 'c', action: 'check', timedOut: true })
    expect(result.table.hand!.phase).toBe('flop')
  })

  it('진행 중인 차례가 없으면 거부한다', () => {
    expect(timeout(tableWith(['a', 'b'])).ok).toBe(false)
  })
})

describe('탈락', () => {
  it('칩을 모두 잃으면 탈락하고, 한 명만 남으면 게임이 끝난다', () => {
    // 헤즈업: 딜러·스몰 a(150칩), 빅 b. 순서 b → a
    const deck = stackedDeck(['Ah Ad', '7c 2d'], '2c 5d 9h Js 3s')
    let table = start(tableWith(['a', 'b'], [150, 10_000]), { deck }).table
    table = play(table, 'a', { type: 'raise', amount: 150 })
    const result = unwrap(act(table, 'b', { type: 'call' }))
    table = result.table

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'player-eliminated', playerId: 'a', place: 2, handNumber: 1 }))
    expect(table.players.find((player) => player.id === 'a')).toMatchObject({ status: 'eliminated', stack: 0, eliminatedAtHand: 1 })
    expect(table.players.find((player) => player.id === 'b')?.place).toBe(1)
    expect(isGameOver(table)).toBe(true)
    expect(startHand(table, { blinds, rng }).ok).toBe(false)
  })

  it('한 핸드에서 여럿이 탈락하면 핸드 시작 칩이 많았던 사람이 순위가 높다', () => {
    const deck = stackedDeck(['Qh Qd', 'Kh Kd', 'Ah Ad'], '2c 5d 9h Js 3s')
    let table = start(tableWith(['a', 'b', 'c'], [10_000, 1_000, 3_000]), { deck }).table
    table = play(table, 'a', { type: 'raise', amount: 10_000 })
    table = play(table, 'b', { type: 'call' })
    table = play(table, 'c', { type: 'call' })

    const places = Object.fromEntries(table.players.map((player) => [player.id, [player.status, player.place]]))
    expect(places).toEqual({ a: ['active', 1], b: ['eliminated', 3], c: ['eliminated', 2] })
  })
})

describe('중간 참가와 퇴장', () => {
  it('핸드 중에 앉은 사람은 다음 핸드부터 참여한다', () => {
    let table = start(tableWith(['a', 'b'])).table
    const joined = unwrap(seatPlayer(table, { id: 'c', name: 'c', seat: 2 }))
    expect(joined.events[0]).toMatchObject({ type: 'player-joined', playerId: 'c', joinsNextHand: true })
    table = joined.table
    expect(table.hand!.players.map((player) => player.id)).toEqual(['a', 'b'])
    expect(playerView(table, 'c').seats.find((seat) => seat.id === 'c')).toMatchObject({ inHand: false, holeCards: null })

    table = play(table, 'a', { type: 'fold' })
    table = start(table).table
    expect(table.hand!.players.map((player) => player.id)).toEqual(['a', 'b', 'c'])
  })

  it('자기 차례에 나가면 폴드하고 다음 사람에게 차례가 간다', () => {
    const table = start(tableWith(['a', 'b', 'c'])).table
    const result = unwrap(leaveTable(table, 'a'))
    expect(eventTypes(result.events)).toEqual(['action', 'turn-started', 'player-left'])
    expect(result.table.hand!.toAct).toBe('b')
    expect(result.table.players.find((player) => player.id === 'a')?.status).toBe('left')
  })

  it('차례가 아닐 때 나가도 폴드 처리되고, 한 명만 남으면 핸드가 끝난다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    table = unwrap(leaveTable(table, 'c')).table
    expect(table.hand!.toAct).toBe('a')
    table = play(table, 'a', { type: 'fold' })
    expect(table.hand!.phase).toBe('complete')
    // 나간 사람은 다음 핸드에 없다.
    expect(start(table).table.hand!.players.map((player) => player.id)).toEqual(['a', 'b'])

    const headsUp = start(tableWith(['a', 'b'])).table
    const left = unwrap(leaveTable(headsUp, 'b')).table
    expect(left.hand!.phase).toBe('complete')
    expect(left.hand!.awards[0].winners[0].playerId).toBe('a')
  })
})

describe('cancelHand', () => {
  it('진행 중인 핸드를 무효로 하고 낸 칩을 모두 돌려준다', () => {
    let table = start(tableWith(['a', 'b', 'c'])).table
    table = play(table, 'a', { type: 'raise', amount: 500 })
    const result = unwrap(cancelHand(table))
    expect(result.events.map((event) => event.type)).toEqual(['hand-cancelled'])
    expect(result.table.players.map((player) => player.stack)).toEqual([10_000, 10_000, 10_000])
    expect(result.table.hand).toMatchObject({ phase: 'complete', toAct: null })
    expect(totalChips(result.table)).toBe(30_000)
    expect(cancelHand(result.table).ok).toBe(false)
  })
})

describe('playerView', () => {
  it('내 홀카드만 보이고, 남은 덱과 다른 사람의 카드는 없다', () => {
    const table = start(tableWith(['a', 'b', 'c'])).table
    const view = playerView(table, 'a')
    const json = JSON.stringify(view)

    expect(view.seats.find((seat) => seat.id === 'a')?.holeCards).toHaveLength(2)
    expect(view.seats.filter((seat) => seat.id !== 'a').every((seat) => seat.holeCards === null)).toBe(true)
    expect(json).not.toContain('deck')
    for (const other of table.hand!.players.filter((player) => player.id !== 'a')) {
      for (const card of other.holeCards) expect(json).not.toContain(JSON.stringify(card))
    }
    expect(view.legal).toMatchObject({ playerId: 'a', callAmount: 100 })
    expect(playerView(table, 'b').legal).toBeUndefined()
    expect(view.potTotal).toBe(150)
  })

  it('쇼다운에서 공개된 카드는 모두에게 보인다', () => {
    const deck = stackedDeck(['Ah Ad', 'Kh Kd', '7c 2d'], '2c 5d 9h Js 3s')
    let table = start(tableWith(['a', 'b', 'c'], [10_000, 1_000, 3_000]), { deck }).table
    table = play(table, 'a', { type: 'raise', amount: 10_000 })
    table = play(table, 'b', { type: 'call' })
    table = play(table, 'c', { type: 'call' })
    const view = playerView(table, 'spectator')
    expect(view.seats.every((seat) => seat.holeCards?.length === 2)).toBe(true)
    expect(view.showdown).toHaveLength(3)
  })
})

describe('불변성과 이벤트 순번', () => {
  it('act는 입력 상태를 바꾸지 않는다', () => {
    const table = start(tableWith(['a', 'b', 'c'])).table
    const snapshot = structuredClone(table)
    play(table, 'a', { type: 'raise', amount: 500 })
    expect(table).toEqual(snapshot)
  })

  it('이벤트 순번은 1씩 늘어나고 끊기지 않는다', () => {
    let table = tableWith(['a', 'b', 'c'])
    const events: EngineEvent[] = []
    let result = start(table)
    events.push(...result.events)
    table = result.table
    for (const id of ['a', 'b']) {
      result = unwrap(act(table, id, { type: 'fold' }))
      events.push(...result.events)
      table = result.table
    }
    const seqs = events.map((event) => event.seq)
    expect(seqs[0]).toBe(table.eventSeq - seqs.length + 1)
    seqs.forEach((seq, index) => index > 0 && expect(seq).toBe(seqs[index - 1] + 1))
  })
})

interface SimulationStats {
  hands: number
  actions: number
  showdowns: number
  sidePotHands: number
}

/** 무작위 참가자들로 게임이 끝날 때까지 두면서 매 행동마다 불변 조건을 검사한다. */
function simulate(seed: number): SimulationStats {
  const random = seededRng(seed)
  let table = tableWith(['a', 'b', 'c', 'd', 'e', 'f'], [10_000, 8_000, 12_000, 6_000, 9_000, 15_000])
  const total = totalChips(table)
  let lastSeq = table.eventSeq
  const stats: SimulationStats = { hands: 0, actions: 0, showdowns: 0, sidePotHands: 0 }
  const track = (events: EngineEvent[]) => {
    for (const event of events) {
      expect(event.seq).toBe(lastSeq + 1)
      lastSeq = event.seq
    }
  }

  while (!isGameOver(table) && stats.hands < 400) {
    // 블라인드를 올려 게임이 반드시 끝나게 한다.
    const level =
      stats.hands < 40 ? blinds : stats.hands < 80 ? { smallBlind: 200, bigBlind: 400 } : { smallBlind: 500, bigBlind: 1_000 }
    const started = unwrap(startHand(table, { blinds: level, rng: random }))
    track(started.events)
    table = started.table
    stats.hands += 1
    let steps = 0

    while (table.hand!.phase !== 'complete') {
      steps += 1
      expect(steps).toBeLessThan(200)
      const actor = table.hand!.toAct!
      const legal = legalActions(table, actor)!
      expect(legal).toBeDefined()
      const handPlayer = table.hand!.players.find((player) => player.id === actor)!
      expect(handPlayer.folded || handPlayer.allIn).toBe(false)

      const roll = random()
      let action: PlayerAction
      if ((legal.canBet || legal.canRaise) && roll < 0.2) {
        // 보통은 최소 금액의 1~3배, 가끔 올인
        const small = legal.minAmount * (1 + Math.floor(random() * 3))
        const amount = random() < 0.1 ? legal.maxAmount : Math.min(legal.maxAmount, small)
        action = { type: legal.canBet ? 'bet' : 'raise', amount }
      } else if (roll < 0.4) action = { type: 'fold' }
      else if (legal.canCheck) action = { type: 'check' }
      else action = { type: 'call' }

      const result = act(table, actor, action)
      expect(result.ok, JSON.stringify(result.ok ? null : result.error)).toBe(true)
      if (!result.ok) break
      track(result.events)
      table = result.table
      stats.actions += 1
      expect(totalChips(table)).toBe(total)
      expect(table.players.every((player) => player.stack >= 0)).toBe(true)
    }

    const hand = table.hand!
    expect(totalChips(table)).toBe(total)
    expect(hand.awards.reduce((sum, award) => sum + award.amount, 0)).toBe(
      hand.players.reduce((sum, player) => sum + player.totalCommitted, 0),
    )
    if (hand.showdown.length > 0) stats.showdowns += 1
    if (hand.awards.length > 1) stats.sidePotHands += 1
  }

  expect(isGameOver(table)).toBe(true)
  expect(table.players.map((player) => player.place).sort()).toEqual([1, 2, 3, 4, 5, 6])
  return stats
}

describe('무작위 시뮬레이션', () => {
  const seeds = Array.from({ length: 20 }, (_, index) => index * 11 + 1)
  const all: SimulationStats[] = []

  it.each(seeds)('시드 %i: 게임이 끝날 때까지 칩이 보존되고 규칙이 깨지지 않는다', (seed) => {
    all.push(simulate(seed))
  })

  it('여러 게임을 합치면 쇼다운과 사이드 팟까지 충분히 거친다', () => {
    const sum = (key: keyof SimulationStats) => all.reduce((total, stats) => total + stats[key], 0)
    expect(all).toHaveLength(seeds.length)
    expect(sum('hands')).toBeGreaterThan(150)
    expect(sum('actions')).toBeGreaterThan(1_000)
    expect(sum('showdowns')).toBeGreaterThan(30)
    expect(sum('sidePotHands')).toBeGreaterThan(10)
  })
})
