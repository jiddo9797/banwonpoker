import { describe, expect, it } from 'vitest'
import { seededRng } from '@banwonpoker/engine'
import { FakeClock } from './clock'
import type { RoomSettings } from './protocol'
import { Room } from './room'
import { agreed, fixedSettings, setupRoom, startedRoom } from './testing'

const deps = () => ({ clock: new FakeClock(), rng: seededRng(1), newId: () => 'p1', newToken: () => 't1' })

describe('방 만들기와 입장', () => {
  it('닉네임과 설정이 올바르지 않으면 방을 만들지 않는다', () => {
    expect(Room.create('R', '하', fixedSettings, deps())).toMatchObject({ ok: false, error: { code: 'INVALID_NICKNAME' } })
    expect(Room.create('R', '하늘', { ...fixedSettings, startingStack: 100 }, deps())).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SETTINGS', message: '시작 칩은 첫 빅 블라인드의 20배(2,000) 이상이어야 합니다.' },
    })
    const broken: RoomSettings = { ...fixedSettings, blindMode: 'increasing', levels: [{ smallBlind: 50, bigBlind: 100 }, { smallBlind: 50, bigBlind: 100 }] }
    expect(Room.create('R', '하늘', broken, deps())).toMatchObject({ ok: false, error: { message: '레벨 2은 레벨 1보다 커야 합니다.' } })
  })

  it('입장하면 확인과 현재 상태를 받고, 다른 사람에게도 새 참가자가 보인다', () => {
    const { join, hostId, messages, state } = setupRoom()
    const minsu = join('민수')

    expect(messages(minsu)[0]).toMatchObject({ type: 'joined', roomCode: 'ROOM01', playerId: minsu, token: 't2' })
    expect(state(minsu).room.participants.map((participant) => participant.nickname)).toEqual(['하늘', '민수'])
    expect(state(hostId).room.participants).toHaveLength(2)
    expect(state(hostId)).toMatchObject({ you: { isHost: true }, room: { hostId, phase: 'lobby' }, game: null })
  })

  it('같은 닉네임, 가득 찬 방은 들어갈 수 없다', () => {
    const { room } = setupRoom({ ...fixedSettings, maxPlayers: 2 })
    expect(room.join('하늘')).toMatchObject({ ok: false, error: { code: 'NICKNAME_TAKEN' } })
    expect(room.join('민수').ok).toBe(true)
    expect(room.join('유진')).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } })
  })
})

describe('좌석과 준비', () => {
  it('없는 좌석, 남의 좌석은 고를 수 없고, 준비 중에는 자리를 옮길 수 없다', () => {
    const { join, send, hostId, lastError, state } = setupRoom()
    const minsu = join('민수')
    send(hostId, { type: 'seat.take', seat: 6 })
    expect(lastError(hostId)).toMatchObject({ code: 'SEAT_TAKEN', message: '없는 좌석입니다.' })

    send(hostId, { type: 'seat.take', seat: 2 })
    send(minsu, { type: 'seat.take', seat: 2 })
    expect(lastError(minsu)?.code).toBe('SEAT_TAKEN')

    send(hostId, { type: 'ready.set', ready: true, consent: agreed, voiceless: false })
    send(hostId, { type: 'seat.take', seat: 3 })
    expect(lastError(hostId)?.message).toBe('준비를 취소한 뒤 자리를 옮기세요.')
    expect(state(minsu).room.participants.find((participant) => participant.id === hostId)).toMatchObject({ seat: 2, ready: true })
  })

  it('준비하려면 좌석과 두 가지 동의가 모두 필요하다(D1)', () => {
    const { send, hostId, lastError, state } = setupRoom()
    send(hostId, { type: 'ready.set', ready: true, consent: agreed, voiceless: false })
    expect(lastError(hostId)?.code).toBe('NO_SEAT')

    send(hostId, { type: 'seat.take', seat: 0 })
    send(hostId, { type: 'ready.set', ready: true, consent: { recording: true, reveal: false }, voiceless: false })
    expect(lastError(hostId)?.code).toBe('CONSENT_REQUIRED')

    send(hostId, { type: 'ready.set', ready: true, consent: agreed, voiceless: true })
    expect(state(hostId).you).toMatchObject({ ready: true, voiceless: true })
  })

  it('음성 없이 참여 여부는 나에게만 보인다(D2)', () => {
    const { join, prepare, send, hostId, state } = setupRoom()
    const minsu = join('민수')
    send(hostId, { type: 'seat.take', seat: 0 })
    send(hostId, { type: 'ready.set', ready: true, consent: agreed, voiceless: true })
    prepare(minsu, 1)

    const seenByMinsu = JSON.stringify(state(minsu).room)
    expect(seenByMinsu).not.toMatch(/voiceless|consent|mic/i)
    expect(state(minsu).you.voiceless).toBe(false)
  })
})

describe('방 설정', () => {
  it('방장만, 게임 전에만 바꿀 수 있다', () => {
    const { join, send, hostId, lastError, state } = setupRoom()
    const minsu = join('민수')
    send(minsu, { type: 'settings.update', settings: { ...fixedSettings, name: '바꿈' } })
    expect(lastError(minsu)?.code).toBe('NOT_HOST')

    send(hostId, { type: 'settings.update', settings: { ...fixedSettings, name: '  토요일 홀덤 ' } })
    expect(state(minsu).room.name).toBe('토요일 홀덤')

    const started = startedRoom()
    started.send(started.hostId, { type: 'settings.update', settings: fixedSettings })
    expect(started.lastError(started.hostId)).toMatchObject({ code: 'WRONG_PHASE', message: '게임 중에는 설정을 바꿀 수 없습니다.' })
  })

  it('이미 들어온 인원이나 앉은 좌석보다 최대 인원을 줄일 수 없다', () => {
    const { join, send, hostId, lastError } = setupRoom()
    join('민수')
    join('유진')
    send(hostId, { type: 'settings.update', settings: { ...fixedSettings, maxPlayers: 2 } })
    expect(lastError(hostId)?.message).toBe('지금 3명이 있어 3명 미만으로 줄일 수 없습니다.')

    send(hostId, { type: 'seat.take', seat: 5 })
    send(hostId, { type: 'settings.update', settings: { ...fixedSettings, maxPlayers: 4 } })
    expect(lastError(hostId)?.message).toBe('6번 좌석에 하늘이(가) 있어 줄일 수 없습니다.')
  })
})

describe('게임 시작', () => {
  it('방장만, 방장도 준비한 뒤, 연결된 준비 인원이 2명 이상일 때 시작한다', () => {
    const { join, send, prepare, hostId, lastError, disconnect } = setupRoom()
    const minsu = join('민수')
    send(minsu, { type: 'game.start' })
    expect(lastError(minsu)?.code).toBe('NOT_HOST')

    send(hostId, { type: 'game.start' })
    expect(lastError(hostId)?.code).toBe('HOST_NOT_READY')

    prepare(hostId, 0)
    send(hostId, { type: 'game.start' })
    expect(lastError(hostId)?.code).toBe('NOT_ENOUGH_PLAYERS')

    prepare(minsu, 1)
    disconnect(minsu)
    send(hostId, { type: 'game.start' })
    expect(lastError(hostId)?.code).toBe('NOT_ENOUGH_PLAYERS')
  })

  it('시작하면 각자 자기 홀카드만 받고, 차례에는 60초 마감 시각이 있다', () => {
    const { state, hostId, minsu, eugene, clock } = startedRoom()
    const hostState = state(hostId)
    expect(hostState.room.phase).toBe('playing')
    expect(hostState.game?.view.handNumber).toBe(1)

    for (const id of [hostId, minsu, eugene]) {
      const seats = state(id).game!.view.seats
      expect(seats.find((seat) => seat.id === id)?.holeCards).toHaveLength(2)
      expect(seats.filter((seat) => seat.id !== id).every((seat) => seat.holeCards === null)).toBe(true)
    }
    // 3명: 딜러 좌석 0(하늘), 스몰 민수, 빅 유진 → 하늘부터
    expect(hostState.game!.turn).toEqual({ playerId: hostId, deadline: clock.now() + 60_000, durationMs: 60_000 })
    expect(hostState.game!.view.legal).toMatchObject({ callAmount: 100, minAmount: 200 })
  })

  it('다른 사람의 홀카드는 어떤 메시지에도 들어가지 않는다', () => {
    const { room, messages, minsu, hostId } = startedRoom()
    const hostCards = room.stateFor(hostId).game!.view.seats.find((seat) => seat.id === hostId)!.holeCards!
    const everythingMinsuGot = JSON.stringify(messages(minsu))
    for (const card of hostCards) expect(everythingMinsuGot).not.toContain(JSON.stringify(card))
  })

  it('이벤트에는 순번과 세션 시각이 붙는다', () => {
    const { events, hostId, clock, send } = startedRoom()
    clock.advance(2_500)
    send(hostId, { type: 'action', clientActionId: 'a1', action: { type: 'call' } })
    const all = events(hostId)
    expect(all.map((event) => event.type)).toContain('hand-started')
    all.forEach((event, index) => index > 0 && expect(event.seq).toBe(all[index - 1].seq + 1))
    expect(all.at(-2)).toMatchObject({ type: 'action', playerId: hostId, sessionTimeMs: 2_500 })
  })
})

describe('액션과 차례', () => {
  it('차례가 아니거나 규칙에 어긋나면 이유와 함께 거절한다', () => {
    const { send, actionResult, minsu, hostId } = startedRoom()
    send(minsu, { type: 'action', clientActionId: 'x1', action: { type: 'fold' } })
    expect(actionResult(minsu, 'x1')[0]).toMatchObject({ ok: false, error: { code: 'ACTION_REJECTED', message: '지금은 하늘 차례입니다.' } })

    send(hostId, { type: 'action', clientActionId: 'x2', action: { type: 'raise', amount: 150 } })
    expect(actionResult(hostId, 'x2')[0]).toMatchObject({ ok: false, error: { message: '최소 레이즈는 200입니다.' } })
  })

  it('같은 clientActionId는 한 번만 처리하고 같은 결과를 돌려준다(중복 입력 잠금)', () => {
    const { send, actionResult, state, hostId } = startedRoom()
    send(hostId, { type: 'action', clientActionId: 'dup', action: { type: 'raise', amount: 300 } })
    const afterFirst = state(hostId).game!.view
    send(hostId, { type: 'action', clientActionId: 'dup', action: { type: 'raise', amount: 300 } })

    expect(actionResult(hostId, 'dup')).toEqual([
      { type: 'action.result', clientActionId: 'dup', ok: true },
      { type: 'action.result', clientActionId: 'dup', ok: true },
    ])
    expect(state(hostId).game!.view.eventSeq).toBe(afterFirst.eventSeq)
  })

  it('60초 안에 행동하지 않으면 체크하거나 폴드하고(D4) 다음 사람의 60초가 시작된다', () => {
    const { clock, state, events, hostId, minsu } = startedRoom()
    clock.advance(59_999)
    expect(state(hostId).game!.turn?.playerId).toBe(hostId)
    clock.advance(1)

    expect(events(hostId).filter((event) => event.type === 'action').at(-1)).toMatchObject({
      playerId: hostId,
      action: 'fold',
      timedOut: true,
    })
    expect(state(hostId).game!.turn).toEqual({ playerId: minsu, deadline: clock.now() + 60_000, durationMs: 60_000 })
  })

  it('연결이 끊긴 사람의 차례도 시간이 지나면 자동 처리된다', () => {
    const { clock, disconnect, state, hostId, minsu } = startedRoom()
    disconnect(hostId)
    expect(state(minsu).room.participants.find((participant) => participant.id === hostId)?.connected).toBe(false)
    clock.advance(60_000)
    expect(state(minsu).game!.turn?.playerId).toBe(minsu)
  })

  it('핸드가 끝나면 잠깐 쉬었다가 딜러를 옮겨 다음 핸드를 시작한다', () => {
    const { clock, send, state, hostId, minsu } = startedRoom()
    send(hostId, { type: 'action', clientActionId: 'f1', action: { type: 'fold' } })
    send(minsu, { type: 'action', clientActionId: 'f2', action: { type: 'fold' } })

    const between = state(hostId).game!
    expect(between.view.phase).toBe('complete')
    expect(between.turn).toBeNull()
    expect(between.nextHandAt).toBe(clock.now() + 5_000)

    clock.advance(5_000)
    const next = state(hostId).game!
    expect(next.view.handNumber).toBe(2)
    expect(next.view.seats.find((seat) => seat.isDealer)?.id).toBe(minsu)
    expect(next.nextHandAt).toBeNull()
  })
})

describe('게임 중 입장(다음 핸드부터)', () => {
  it('게임 중에 들어와 준비하면 대기하다가 다음 핸드부터 참여한다', () => {
    const { join, prepare, send, state, clock, hostId, minsu } = startedRoom()
    const jihun = join('지훈')
    expect(state(jihun).room.participants.find((participant) => participant.id === jihun)?.status).toBe('lobby')

    prepare(jihun, 3)
    expect(state(hostId).room.participants.find((participant) => participant.id === jihun)?.status).toBe('waiting')
    expect(state(jihun).game!.view.seats.find((seat) => seat.id === jihun)).toMatchObject({ inHand: false, holeCards: null })

    send(hostId, { type: 'action', clientActionId: 'f1', action: { type: 'fold' } })
    send(minsu, { type: 'action', clientActionId: 'f2', action: { type: 'fold' } })
    clock.advance(5_000)
    expect(state(jihun).game!.view.seats.find((seat) => seat.id === jihun)).toMatchObject({ inHand: true })
    expect(state(jihun).game!.view.seats.find((seat) => seat.id === jihun)?.holeCards).toHaveLength(2)
  })
})

describe('블라인드 인상', () => {
  it('인상 간격이 지나면 다음 핸드부터 다음 레벨을 쓴다', () => {
    const settings: RoomSettings = {
      ...fixedSettings,
      blindMode: 'increasing',
      levelMinutes: 5,
      levels: [
        { smallBlind: 50, bigBlind: 100 },
        { smallBlind: 100, bigBlind: 200 },
      ],
    }
    // 5분을 흘리는 동안 차례 타이머가 터지지 않게 제한 시간을 길게 둔다.
    const { clock, send, state, hostId, minsu } = startedRoom(settings, { turnMs: 60 * 60_000 })
    const first = state(hostId).game!
    expect(first.blinds).toEqual({
      level: { smallBlind: 50, bigBlind: 100 },
      levelIndex: 0,
      nextLevel: { smallBlind: 100, bigBlind: 200 },
      nextLevelAt: first.startedAt + 5 * 60_000,
    })

    clock.advance(5 * 60_000)
    send(hostId, { type: 'action', clientActionId: 'f1', action: { type: 'fold' } })
    send(minsu, { type: 'action', clientActionId: 'f2', action: { type: 'fold' } })
    clock.advance(5_000)
    expect(state(hostId).game!.blinds).toMatchObject({ level: { smallBlind: 100, bigBlind: 200 }, levelIndex: 1, nextLevel: null, nextLevelAt: null })
  })
})

describe('세션 종료', () => {
  it('방장이 도중에 끝내면 진행 중인 핸드를 무효로 하고 요약을 보여준다', () => {
    const { send, state, hostId, minsu, lastError } = startedRoom()
    send(minsu, { type: 'session.end' })
    expect(lastError(minsu)?.code).toBe('NOT_HOST')

    send(hostId, { type: 'action', clientActionId: 'r1', action: { type: 'raise', amount: 800 } })
    send(hostId, { type: 'session.end' })
    const { room } = state(minsu)
    expect(room.phase).toBe('ended')
    expect(room.summary).toMatchObject({ reason: 'host-ended', handsPlayed: 0 })
    // 레이즈한 800과 블라인드는 모두 돌려받는다.
    expect(room.summary!.results.map((result) => [result.nickname, result.finalStack, result.delta])).toEqual([
      ['하늘', 10_000, 0],
      ['민수', 10_000, 0],
      ['유진', 10_000, 0],
    ])
    expect(state(minsu).game!.turn).toBeNull()
  })

  it('한 명만 남으면 자동으로 끝나고 탈락 순위가 요약에 남는다', () => {
    const harness = startedRoom()
    const { room, clock, send } = harness
    let guard = 0
    // 차례인 사람이 계속 올인하거나 콜한다.
    while (room.currentPhase === 'playing' && guard < 500) {
      guard += 1
      const view = room.stateFor(harness.hostId).game!.view
      if (view.phase === 'complete' || !view.toAct) {
        clock.advance(5_000)
        continue
      }
      const legal = room.stateFor(view.toAct).game!.view.legal!
      const action =
        legal.canRaise || legal.canBet
          ? { type: legal.canBet ? ('bet' as const) : ('raise' as const), amount: legal.maxAmount }
          : { type: 'call' as const }
      send(view.toAct, { type: 'action', clientActionId: `a${guard}`, action })
    }

    const summary = harness.state(harness.hostId).room.summary!
    expect(summary.reason).toBe('last-player')
    expect(summary.results.map((result) => result.place)).toEqual([1, 2, 3])
    expect(summary.results[0]).toMatchObject({ finalStack: 30_000, delta: 20_000, eliminatedAtHand: null })
    expect(summary.results.slice(1).every((result) => result.finalStack === 0 && result.eliminatedAtHand !== null)).toBe(true)
    // 탈락한 사람은 좌석을 비운다.
    const participants = harness.state(harness.hostId).room.participants
    expect(participants.filter((participant) => participant.status === 'eliminated').every((participant) => participant.seat === null)).toBe(true)
  })

  it('끝난 세션에는 들어갈 수 없다', () => {
    const { room, send, hostId } = startedRoom()
    send(hostId, { type: 'session.end' })
    expect(room.join('지훈')).toMatchObject({ ok: false, error: { code: 'ROOM_ENDED' } })
  })
})

describe('퇴장과 재접속', () => {
  it('자기 차례에 나가면 폴드되고, 방장이 나가면 다음 사람이 방장이 된다', () => {
    const { send, state, hostId, minsu } = startedRoom()
    send(hostId, { type: 'room.leave' })
    const seen = state(minsu)
    expect(seen.room.hostId).toBe(minsu)
    expect(seen.room.participants.map((participant) => participant.nickname)).toEqual(['민수', '유진'])
    expect(seen.game!.turn?.playerId).toBe(minsu)
    expect(seen.you.isHost).toBe(true)
  })

  it('대기실에서 나가면 좌석이 비고, 모두 나가면 방을 닫는다', () => {
    const { join, send, prepare, state, closed, hostId } = setupRoom()
    const minsu = join('민수')
    prepare(minsu, 3)
    send(minsu, { type: 'room.leave' })
    send(hostId, { type: 'seat.take', seat: 3 })
    expect(state(hostId).you.seat).toBe(3)

    send(hostId, { type: 'room.leave' })
    expect(closed).toEqual(['ROOM01'])
  })

  it('토큰으로 같은 자리에 돌아오면 최근 이벤트와 현재 상태를 다시 받는다', () => {
    const { room, disconnect, connect, messages, minsu } = startedRoom()
    disconnect(minsu)
    expect(room.findByToken('t2')).toBe(minsu)
    expect(room.findByToken('wrong')).toBeUndefined()

    connect(minsu)
    const received = messages(minsu).map((message) => message.type)
    expect(received.slice(0, 3)).toEqual(['joined', 'events', 'state'])
    expect(room.stateFor(minsu).game!.view.seats.find((seat) => seat.id === minsu)?.holeCards).toHaveLength(2)
  })

  it('아무도 접속하지 않은 채 오래 지나면 방을 닫고, 그 전에 돌아오면 유지한다', () => {
    const harness = setupRoom()
    harness.disconnect(harness.hostId)
    harness.clock.advance(599_999)
    harness.connect(harness.hostId)
    harness.clock.advance(10 * 60_000)
    expect(harness.closed).toEqual([])

    harness.disconnect(harness.hostId)
    harness.clock.advance(600_000)
    expect(harness.closed).toEqual(['ROOM01'])
  })
})
