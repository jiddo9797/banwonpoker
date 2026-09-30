import { act, createTable, playerView, seatPlayer, seededRng, startHand } from '@banwonpoker/engine'
import type { EngineResult, TableState } from '@banwonpoker/engine'
import type { ClientState, ParticipantSnapshot, RoomSettings, TimedEvent } from '@banwonpoker/server/protocol'
import { describe, expect, it } from 'vitest'
import { actionOptions, blindNoteOf, formatEvent, toCard, toLobbyParticipants, toPlayerAction, toTableSnapshot } from './adapt'

const settings: RoomSettings = {
  name: '테스트',
  maxPlayers: 6,
  startingStack: 10_000,
  blindMode: 'fixed',
  levels: [{ smallBlind: 50, bigBlind: 100 }],
  levelMinutes: 15,
}

function ok(result: EngineResult) {
  if (!result.ok) throw new Error(result.error.message)
  return result
}

const NOW = 1_000_000

/** 실제 엔진으로 테이블을 만들고 서버가 보낼 ClientState를 흉내 낸다. */
function build(names: string[], viewer: string, options: { maxPlayers?: number; seats?: number[]; mutate?: (table: TableState) => TableState } = {}) {
  let table = createTable({ startingStack: 10_000, maxSeats: options.maxPlayers ?? 6 })
  names.forEach((name, index) => {
    table = ok(seatPlayer(table, { id: name, name, seat: options.seats?.[index] ?? index })).table
  })
  const started = ok(startHand(table, { blinds: { smallBlind: 50, bigBlind: 100 }, rng: seededRng(5) }))
  table = options.mutate ? options.mutate(started.table) : started.table
  const events: TimedEvent[] = started.events.map((event) => ({ ...event, sessionTimeMs: 0 }))
  const participants: ParticipantSnapshot[] = names.map((name, index) => ({
    id: name,
    nickname: name,
    seat: options.seats?.[index] ?? index,
    ready: true,
    connected: true,
    isHost: index === 0,
    status: 'playing',
  }))
  const state: ClientState = {
    serverTime: NOW,
    room: {
      code: 'ABC234',
      name: '테스트',
      hostId: names[0],
      phase: 'playing',
      settings: { ...settings, maxPlayers: options.maxPlayers ?? 6 },
      participants,
      summary: null,
    },
    you: { playerId: viewer, isHost: viewer === names[0], seat: 0, ready: true, voiceless: false },
    game: {
      startedAt: NOW - 1_000,
      view: playerView(table, viewer),
      turn: table.hand?.toAct ? { playerId: table.hand.toAct, deadline: NOW + 42_000, durationMs: 60_000 } : null,
      blinds: { level: { smallBlind: 50, bigBlind: 100 }, levelIndex: 0, nextLevel: null, nextLevelAt: null },
      nextHandAt: null,
    },
  }
  return { state, events, table }
}

describe('toCard', () => {
  it('엔진 숫자를 화면 표기로 바꾼다', () => {
    expect(toCard({ rank: 14, suit: 'heart' })).toEqual({ rank: 'A', suit: 'heart' })
    expect(toCard({ rank: 10, suit: 'club' })).toEqual({ rank: '10', suit: 'club' })
    expect(toCard({ rank: 2, suit: 'spade' })).toEqual({ rank: '2', suit: 'spade' })
  })
})

describe('toTableSnapshot', () => {
  it('내 좌석을 아래 가운데에 두고 나머지를 시계 방향으로 돌려 놓는다', () => {
    // 나는 좌석 2. 좌석 3 → 좌하, 4 → 좌상, 5 → 상단, 0 → 우상, 1 → 우하
    const { state, events } = build(['a', 'b', 'me', 'c', 'd', 'e'], 'me')
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'open' })
    expect(Object.fromEntries(snapshot.seats.map((seat) => [seat.id, seat.position]))).toEqual({
      c: 'bottom-left',
      d: 'top-left',
      e: 'top-center',
      a: 'top-right',
      b: 'bottom-right',
    })
    expect(snapshot.heroCards).toHaveLength(2)
    expect(snapshot.seats.every((seat) => seat.showdownCards === undefined)).toBe(true)
  })

  it('헤즈업은 상대를 위쪽 가운데에 둔다', () => {
    const { state, events } = build(['me', 'you'], 'me', { maxPlayers: 2 })
    expect(toTableSnapshot(state, events, { now: NOW, status: 'open' }).seats[0].position).toBe('top-center')
  })

  it('내 차례면 네 칸 액션과 베팅 범위를 채우고 남은 시간을 초로 보여준다', () => {
    // 3명: 딜러 a(좌석 0) → a가 먼저
    const { state, events } = build(['a', 'b', 'c'], 'a')
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'open' })
    expect(snapshot.actions.map((action) => [action.id, action.label, action.enabled, action.detail])).toEqual([
      ['call', '콜', true, '100'],
      ['raise', '레이즈', true, '최소 200'],
      ['check', '체크', false, '베팅이 있어 불가'],
      ['fold', '폴드', true, '핸드 포기'],
    ])
    expect(snapshot).toMatchObject({ callAmount: 100, minRaise: 200, maxRaise: 10_000, heroRemainingSeconds: 42, heroBadge: 'D' })
    expect(snapshot.actionHint).toBe('액션과 베팅 금액을 선택하세요')
  })

  it('남의 차례면 버튼을 모두 잠그고 누구를 기다리는지 알려준다', () => {
    const { state, events } = build(['a', 'b', 'c'], 'b')
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'open' })
    expect(snapshot.actions.every((action) => !action.enabled)).toBe(true)
    expect(snapshot.actionHint).toBe('a 차례를 기다리는 중')
    expect(snapshot.seats.find((seat) => seat.id === 'a')).toMatchObject({ isTurn: true, remainingSeconds: 42, badge: 'D' })
    expect(snapshot.heroBadge).toBe('SB')
    expect(snapshot.heroBet).toBe(50)
  })

  it('핸드가 끝나면 이긴 사람과 금액을 테이블 문구로 보여준다', () => {
    const { state, events } = build(['a', 'b', 'c'], 'c', {
      mutate: (table) => ok(act(ok(act(table, 'a', { type: 'fold' })).table, 'b', { type: 'fold' })).table,
    })
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'open' })
    expect(snapshot.tableMessage).toBe('나 승리 +150')
    expect(snapshot.heroIsWinner).toBe(true)
    expect(snapshot.street).toBe('결과')
    expect(snapshot.pots).toEqual([{ label: '팟', amount: 150 }])
  })

  it('연결이 끊긴 참가자와 다음 핸드를 기다리는 참가자를 구분한다', () => {
    const { state, events } = build(['a', 'b', 'c'], 'a', {
      mutate: (table) => ok(seatPlayer(table, { id: 'late', name: 'late', seat: 4 })).table,
    })
    state.room.participants.find((participant) => participant.id === 'b')!.connected = false
    state.room.participants.push({ id: 'late', nickname: 'late', seat: 4, ready: true, connected: true, isHost: false, status: 'waiting' })
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'reconnecting' })
    expect(snapshot.seats.find((seat) => seat.id === 'b')?.status).toBe('disconnected')
    expect(snapshot.seats.find((seat) => seat.id === 'late')).toMatchObject({ inHand: false, statusNote: '다음 핸드부터' })
    expect(snapshot.connection).toBe('reconnecting')
  })

  it('관전 중이면 내 카드 없이 빈 좌석을 기준으로 그린다', () => {
    const { state, events } = build(['a', 'b'], 'watcher', { maxPlayers: 3 })
    const snapshot = toTableSnapshot(state, events, { now: NOW, status: 'open' })
    expect(snapshot.heroCards).toBeNull()
    expect(snapshot.seats.map((seat) => seat.position).sort()).toEqual(['top-left', 'top-right'])
    expect(snapshot.actionHint).toBe('관전 중입니다')
  })
})

describe('actionOptions / toPlayerAction', () => {
  const legal = {
    playerId: 'a',
    canFold: true,
    canCheck: true,
    callAmount: 0,
    canBet: true,
    canRaise: false,
    minAmount: 100,
    maxAmount: 5_000,
  }

  it('베팅이 없으면 체크·베팅을, 콜은 이유와 함께 잠근다', () => {
    const options = actionOptions(legal, 5_000)
    expect(options.map((option) => [option.label, option.enabled, option.detail])).toEqual([
      ['콜', false, '낼 금액 없음'],
      ['베팅', true, '최소 100'],
      ['체크', true, '베팅 없이 넘기기'],
      ['폴드', true, '핸드 포기'],
    ])
    expect(toPlayerAction('raise', legal, 300)).toEqual({ type: 'bet', amount: 300 })
    expect(toPlayerAction('raise', { ...legal, canBet: false, canRaise: true }, 300)).toEqual({ type: 'raise', amount: 300 })
    expect(toPlayerAction('check', legal, 0)).toEqual({ type: 'check' })
  })

  it('콜 금액이 스택 이상이면 올인이라고 알리고 레이즈는 막는다', () => {
    const options = actionOptions({ ...legal, canCheck: false, callAmount: 800, canBet: false, canRaise: false }, 800)
    expect(options[0].detail).toBe('800 · 올인')
    expect(options[1]).toMatchObject({ enabled: false, detail: '칩이 모자라 불가' })
  })
})

describe('formatEvent', () => {
  const nameOf = (id: string) => id
  const action = (overrides: Partial<Extract<TimedEvent, { type: 'action' }>>): TimedEvent => ({
    type: 'action',
    seq: 1,
    sessionTimeMs: 0,
    playerId: '민수',
    street: 'flop',
    action: 'call',
    amount: 300,
    to: 300,
    allIn: false,
    timedOut: false,
    ...overrides,
  })

  it.each([
    [action({}), '민수가 300 콜'],
    [action({ playerId: '수빈', action: 'raise', to: 900 }), '수빈이 900으로 레이즈'],
    [action({ playerId: '수빈', action: 'raise', to: 1_200 }), '수빈이 1,200으로 레이즈'],
    [action({ playerId: '지훈', action: 'raise', to: 2_450 }), '지훈이 2,450으로 레이즈'],
    [action({ playerId: '서준', action: 'bet', to: 300 }), '서준 300 베팅'],
    [action({ playerId: '지훈', action: 'fold' }), '지훈 폴드'],
    [action({ playerId: '유진', action: 'check', timedOut: true }), '유진 체크 · 시간 초과'],
    [action({ playerId: '서준', action: 'call', to: 2_150, allIn: true }), '서준이 2,150 콜 · 올인'],
  ])('%#: %s', (event, expected) => {
    expect(formatEvent(event, nameOf)).toBe(expected)
  })

  it('보드, 정산, 탈락, 무효를 글로 쓴다', () => {
    expect(
      formatEvent({ type: 'street-dealt', seq: 1, sessionTimeMs: 0, street: 'flop', cards: [{ rank: 13, suit: 'spade' }, { rank: 9, suit: 'heart' }, { rank: 10, suit: 'club' }] }, nameOf),
    ).toBe('플랍 K♠ 9♥ 10♣')
    expect(
      formatEvent({ type: 'pot-awarded', seq: 1, sessionTimeMs: 0, award: { potIndex: 0, amount: 600, winners: [{ playerId: '민수', amount: 600 }], handName: '세븐 원 페어' } }, nameOf),
    ).toBe('민수 +600 · 세븐 원 페어')
    expect(formatEvent({ type: 'player-eliminated', seq: 1, sessionTimeMs: 0, playerId: '서준', place: 5, handNumber: 3 }, nameOf)).toBe('서준 탈락 · 5위')
    expect(formatEvent({ type: 'hole-cards-dealt', seq: 1, sessionTimeMs: 0, handNumber: 1 }, nameOf)).toBeNull()
  })
})

describe('toLobbyParticipants / blindNoteOf', () => {
  it('나와 나간 사람을 빼고 좌석을 1부터 센다', () => {
    const participants: ParticipantSnapshot[] = [
      { id: 'me', nickname: '하늘', seat: 0, ready: true, connected: true, isHost: true, status: 'lobby' },
      { id: 'b', nickname: '민수', seat: 2, ready: false, connected: false, isHost: false, status: 'lobby' },
      { id: 'c', nickname: '유진', seat: null, ready: false, connected: true, isHost: false, status: 'left' },
    ]
    expect(toLobbyParticipants(participants, 'me')).toEqual([
      { id: 'b', name: '민수', seatNumber: 3, ready: false, connection: 'disconnected', isHost: false },
    ])
  })

  it('다음 블라인드 레벨까지 남은 분을 알려준다', () => {
    const { state } = build(['a', 'b'], 'a')
    state.game!.blinds = { level: { smallBlind: 50, bigBlind: 100 }, levelIndex: 0, nextLevel: { smallBlind: 100, bigBlind: 200 }, nextLevelAt: NOW + 4.2 * 60_000 }
    expect(blindNoteOf(state, NOW)).toBe('레벨 1 · 5분 뒤 100 / 200')
  })
})
