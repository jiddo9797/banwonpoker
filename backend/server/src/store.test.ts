import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seededRng } from '@banwonpoker/engine'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeClock } from './clock'
import { buildReplay, turnStatus } from './replay'
import { Room } from './room'
import { hashToken, SessionStore } from './store'
import type { StoredTurn } from './store'
import type { ReplayData } from './protocol'
import { startGameServer } from './server'
import type { GameServer } from './server'
import { agreed, fixedSettings } from './testing'

const bytes = (...values: number[]) => new Uint8Array(values)

/** 저장소를 붙인 방에서 세 사람이 한 판을 둔다. 하늘 레이즈 → 민수 콜 → 유진 폴드 → 플랍… */
function playedRoom(store: SessionStore) {
  const clock = new FakeClock()
  let count = 0
  const created = Room.create('ROOM01', '하늘', fixedSettings, {
    clock,
    rng: seededRng(7),
    newId: () => `p${++count}`,
    newToken: () => `t${count}`,
    newSessionId: () => 'S1',
    store,
    options: { turnMs: 60_000, nextHandDelayMs: 5_000 },
  })
  if (!created.ok) throw new Error(created.error.message)
  const { room, playerId: host } = created.value
  const minsu = (room.join('민수') as { ok: true; value: { playerId: string } }).value.playerId
  const eugene = (room.join('유진') as { ok: true; value: { playerId: string } }).value.playerId
  for (const [index, id] of [host, minsu, eugene].entries()) {
    room.attach(id, () => undefined)
    room.handle(id, { type: 'seat.take', seat: index })
    room.handle(id, { type: 'ready.set', ready: true, consent: agreed, voiceless: id === eugene })
  }
  room.handle(host, { type: 'game.start' })
  clock.advance(3_000)
  room.handle(host, { type: 'action', clientActionId: 'a', action: { type: 'raise', amount: 300 } })
  clock.advance(4_000)
  room.handle(minsu, { type: 'action', clientActionId: 'b', action: { type: 'call' } })
  clock.advance(1_000)
  room.handle(eugene, { type: 'action', clientActionId: 'c', action: { type: 'fold' } })
  return { room, clock, host, minsu, eugene }
}

describe('SessionStore', () => {
  it('세션·참가자·핸드·이벤트·차례를 기록하고 토큰은 해시로만 저장한다', () => {
    const store = new SessionStore()
    const { room, host, minsu, eugene } = playedRoom(store)
    expect(room.currentSessionId).toBe('S1')

    expect(store.getSession('S1')).toMatchObject({ roomCode: 'ROOM01', name: '금요일 밤 홀덤', endedAt: null })
    expect(store.participants('S1').map((participant) => [participant.nickname, participant.voiceless])).toEqual([
      ['하늘', false],
      ['민수', false],
      ['유진', true],
    ])
    expect(store.participantByToken('S1', 't1')?.playerId).toBe(host)
    expect(store.participantByToken('S1', 'wrong')).toBeUndefined()
    expect(hashToken('t1')).not.toBe('t1')

    const [hand] = store.hands('S1')
    expect(hand.holeCards.map((item) => item.playerId)).toEqual([host, minsu, eugene])
    expect(hand.holeCards.every((item) => item.cards.length === 2)).toBe(true)

    const turns = store.turns('S1')
    expect(turns.slice(0, 3).map((turn) => [turn.playerId, turn.startedMs, turn.endedMs, turn.voiceless])).toEqual([
      [host, 0, 3_000, false],
      [minsu, 3_000, 7_000, false],
      [eugene, 7_000, 8_000, true],
    ])
    expect(store.events('S1').map((event) => event.type)).toContain('street-dealt')
  })

  it('같은 번호의 음성 조각은 한 번만 저장하고, 차례별로 순서대로 이어 붙인다', () => {
    const store = new SessionStore()
    const { host } = playedRoom(store)
    const turnSeq = store.turns('S1').find((turn) => turn.playerId === host)!.turnSeq
    expect(store.saveChunk('S1', turnSeq, 1, bytes(3, 4))).toBe(true)
    expect(store.saveChunk('S1', turnSeq, 0, bytes(1, 2))).toBe(true)
    expect(store.saveChunk('S1', turnSeq, 0, bytes(9, 9))).toBe(false)
    expect([...store.turnAudio('S1', turnSeq)!]).toEqual([1, 2, 3, 4])
    // 중간이 빠지면 앞부분만 쓴다.
    store.saveChunk('S1', turnSeq, 3, bytes(7))
    expect([...store.turnAudio('S1', turnSeq)!]).toEqual([1, 2, 3, 4])
  })

  it('파일 폴더에 저장하면 서버를 다시 켜도 기록이 남는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bwp-store-'))
    try {
      const store = new SessionStore(dir)
      const { host, room } = playedRoom(store)
      const turnSeq = store.turns('S1').find((turn) => turn.playerId === host)!.turnSeq
      store.saveChunk('S1', turnSeq, 0, bytes(5, 6, 7))
      room.handle(host, { type: 'session.end' })
      store.close()

      const reopened = new SessionStore(dir)
      expect(reopened.getSession('S1')?.summary?.sessionId).toBe('S1')
      expect([...reopened.turnAudio('S1', turnSeq)!]).toEqual([5, 6, 7])
      reopened.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('turnStatus', () => {
  const turn = (overrides: Partial<StoredTurn>): StoredTurn => ({
    turnSeq: 1,
    handNumber: 1,
    playerId: 'p1',
    startedMs: 0,
    endedMs: 5_000,
    voiceless: false,
    receivedChunks: 2,
    report: { chunks: 2, durationMs: 5_000, silent: false, failed: false, audioStartMs: 100 },
    ...overrides,
  })

  it.each([
    ['음성', turn({}), 'voice'],
    ['무발언', turn({ report: { chunks: 2, durationMs: 5_000, silent: true, failed: false, audioStartMs: 0 } }), 'silent'],
    ['기록 실패', turn({ receivedChunks: 0, report: { chunks: 0, durationMs: 0, silent: false, failed: true, audioStartMs: null } }), 'failed'],
    ['조각 누락', turn({ receivedChunks: 1 }), 'missing'],
    ['녹음이 켜지기 전에 끝남', turn({ receivedChunks: 0, report: { chunks: 0, durationMs: 0, silent: false, failed: false, audioStartMs: null } }), 'silent'],
    ['보고 없음·조각 없음', turn({ receivedChunks: 0, report: null }), 'missing'],
    ['보고 없음·조각 있음', turn({ receivedChunks: 1, report: null }), 'voice'],
    ['음성 없이 참여', turn({ voiceless: true }), 'voiceless'],
  ])('%s', (_, value, expected) => {
    expect(turnStatus(value).status).toBe(expected)
  })

  it('차례 기록이 없으면 누락이다', () => {
    expect(turnStatus(undefined).status).toBe('missing')
  })
})

describe('게임 중 음성 기록 끄기·켜기', () => {
  it('내 차례 도중에 끄면 그 차례부터 음성 없이로 기록하고, 다시 켜면 다음 차례부터 녹음한다', () => {
    const store = new SessionStore()
    const { room, host, minsu } = playedRoom(store)
    // 플랍은 민수부터
    expect(room.stateFor(host).game!.turn!.playerId).toBe(minsu)

    room.handle(minsu, { type: 'voice.set', voiceless: true })
    expect(room.stateFor(minsu).you.voiceless).toBe(true)
    const flopTurn = store.turns('S1').at(-1)!
    expect(flopTurn).toMatchObject({ playerId: minsu, voiceless: true })
    store.saveChunk('S1', flopTurn.turnSeq, 0, bytes(1))
    expect(turnStatus(store.turn('S1', flopTurn.turnSeq))).toMatchObject({ status: 'voiceless' })

    // 남의 차례에 다시 켜도 그 사람의 차례는 그대로다.
    room.handle(minsu, { type: 'action', clientActionId: 'm1', action: { type: 'check' } })
    room.handle(minsu, { type: 'voice.set', voiceless: false })
    expect(store.turns('S1').at(-1)).toMatchObject({ playerId: host, voiceless: false })

    // 턴에서 민수의 다음 차례는 녹음한다.
    room.handle(host, { type: 'action', clientActionId: 'h1', action: { type: 'check' } })
    expect(store.turns('S1').at(-1)).toMatchObject({ playerId: minsu, voiceless: false })
  })
})

describe('복기 핸드 표시', () => {
  it('게임 중에 표시한 핸드는 그 사람에게만 보이고, 아직 시작하지 않은 핸드는 표시할 수 없다', () => {
    const store = new SessionStore()
    const { room, host, minsu } = playedRoom(store)
    const sent: string[] = []
    room.attach(host, (message) => sent.push(`host:${message.type}`))
    room.attach(minsu, (message) => sent.push(`minsu:${message.type}`))
    sent.length = 0

    room.handle(minsu, { type: 'hand.mark', handNumber: 1, marked: true })
    expect(room.stateFor(minsu).you.markedHands).toEqual([1])
    expect(room.stateFor(host).you.markedHands).toEqual([])
    // 바뀐 상태는 표시한 사람에게만 보낸다(다른 사람은 누가 표시했는지 모른다).
    expect(sent).toEqual(['minsu:state'])
    expect(store.marks('S1', minsu)).toEqual([1])

    const errors: string[] = []
    room.attach(minsu, (message) => message.type === 'error' && errors.push(message.error.message))
    room.handle(minsu, { type: 'hand.mark', handNumber: 2, marked: true })
    expect(errors).toEqual(['아직 시작하지 않은 핸드입니다.'])

    room.handle(minsu, { type: 'hand.mark', handNumber: 1, marked: false })
    expect(room.stateFor(minsu).you.markedHands).toEqual([])
    expect(store.marks('S1', minsu)).toEqual([])
  })
})

describe('buildReplay', () => {
  it('핸드별 전체 패, 액션 순서, 팟, 생각 시간, 음성 상태를 만든다', () => {
    const store = new SessionStore()
    const { host, minsu, eugene, room } = playedRoom(store)
    const hostTurn = store.turns('S1').find((turn) => turn.playerId === host)!
    store.saveChunk('S1', hostTurn.turnSeq, 0, bytes(1))
    store.reportTurn('S1', hostTurn.turnSeq, { chunks: 1, durationMs: 2_500, silent: false, failed: false, audioStartMs: 200 })
    room.handle(host, { type: 'session.end' })

    const replay = buildReplay(store.getSession('S1')!, store.participants('S1'), store.hands('S1'), store.events('S1'), store.turns('S1'))
    const [hand] = replay.hands
    expect(hand.players.map((player) => player.nickname)).toEqual(['하늘', '민수', '유진'])
    expect(hand.players.map((player) => player.startStack)).toEqual([10_000, 10_000, 10_000])
    expect(hand.cancelled).toBe(true)
    expect(hand.actions.slice(0, 5).map((action) => [action.playerId, action.kind, action.to, action.pot, action.thinkMs, action.audio.status])).toEqual([
      [minsu, 'blind', 50, 50, null, 'none'],
      [eugene, 'blind', 100, 150, null, 'none'],
      [host, 'raise', 300, 450, 3_000, 'voice'],
      [minsu, 'call', 300, 700, 4_000, 'missing'],
      [eugene, 'fold', 100, 700, 1_000, 'voiceless'],
    ])
    expect(hand.actions[2].audio.durationMs).toBe(2_500)
    expect(hand.streets.map((street) => street.street)).toEqual(['flop'])
    expect(replay.session.summary?.reason).toBe('host-ended')
  })
})

describe('buildReplay 시작 칩 되짚기', () => {
  const card = (rank: number) => ({ rank: rank as never, suit: 'spade' as const })
  const blinds = { smallBlind: 50, bigBlind: 100 }
  const session = {
    id: 'S1',
    roomCode: 'ABC234',
    name: '예전 세션',
    settings: fixedSettings,
    startedAt: 0,
    endedAt: 1,
    summary: null,
  }
  const participants = ['a', 'b', 'c'].map((playerId, seat) => ({ playerId, nickname: playerId, seat, voiceless: false }))
  // 시작 칩을 저장하기 전의 기록처럼 startStack이 없다.
  const hand = (handNumber: number, ids: string[]) => ({
    handNumber,
    dealerSeat: 0,
    blinds,
    holeCards: ids.map((playerId) => ({ playerId, seat: participants.find((p) => p.playerId === playerId)!.seat, cards: [card(2), card(3)] as never })),
    board: [],
  })

  it('예전 핸드는 블라인드·액션·팟 분배·무효 환불로 시작 칩을 계산한다', () => {
    let seq = 0
    const e = (body: object) => ({ ...body, seq: ++seq, sessionTimeMs: seq }) as never
    const events = [
      e({ type: 'hand-started', handNumber: 1, dealerSeat: 0, smallBlindSeat: 1, bigBlindSeat: 2, blinds, playerIds: ['a', 'b'] }),
      e({ type: 'blind-posted', playerId: 'a', blind: 'small', amount: 50, allIn: false }),
      e({ type: 'blind-posted', playerId: 'b', blind: 'big', amount: 100, allIn: false }),
      e({ type: 'action', playerId: 'a', street: 'preflop', action: 'raise', amount: 250, to: 300, allIn: false, timedOut: false }),
      e({ type: 'action', playerId: 'b', street: 'preflop', action: 'fold', amount: 0, to: 100, allIn: false, timedOut: false }),
      e({ type: 'pot-awarded', award: { potIndex: 0, amount: 400, winners: [{ playerId: 'a', amount: 400 }] } }),
      e({ type: 'hand-ended', handNumber: 1 }),
      // 2번 핸드는 무효: 낸 칩을 돌려받는다. c는 여기서 처음 들어온다.
      e({ type: 'hand-started', handNumber: 2, dealerSeat: 1, smallBlindSeat: 2, bigBlindSeat: 0, blinds, playerIds: ['a', 'b', 'c'] }),
      e({ type: 'blind-posted', playerId: 'c', blind: 'small', amount: 50, allIn: false }),
      e({ type: 'blind-posted', playerId: 'a', blind: 'big', amount: 100, allIn: false }),
      e({ type: 'hand-cancelled', handNumber: 2 }),
      e({ type: 'hand-started', handNumber: 3, dealerSeat: 2, smallBlindSeat: 0, bigBlindSeat: 1, blinds, playerIds: ['a', 'b', 'c'] }),
      e({ type: 'blind-posted', playerId: 'a', blind: 'small', amount: 50, allIn: false }),
    ]
    const replay = buildReplay(session, participants, [hand(1, ['a', 'b']), hand(2, ['a', 'b', 'c']), hand(3, ['a', 'b', 'c'])], events, [])
    const starts = replay.hands.map((item) => item.players.map((player) => player.startStack))
    expect(starts).toEqual([
      [10_000, 10_000],
      [10_100, 9_900, 10_000],
      [10_100, 9_900, 10_000],
    ])
  })

  it('저장된 시작 칩이 있으면 그 값을 쓴다', () => {
    const stored = { ...hand(1, ['a', 'b']), holeCards: hand(1, ['a', 'b']).holeCards.map((item, index) => ({ ...item, startStack: 5_000 + index })) }
    const events = [{ type: 'hand-started', handNumber: 1, dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1, blinds, playerIds: ['a', 'b'], seq: 1, sessionTimeMs: 0 } as never]
    expect(buildReplay(session, participants, [stored], events, []).hands[0].players.map((player) => player.startStack)).toEqual([5_000, 5_001])
  })
})

describe('HTTP API', () => {
  let server: GameServer | undefined
  let store: SessionStore
  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  async function start(options: { staticDir?: string } = {}) {
    store = new SessionStore()
    const played = playedRoom(store)
    server = await startGameServer({ port: 0, store, staticDir: options.staticDir })
    const base = `http://127.0.0.1:${server.port}`
    const turns = store.turns('S1')
    const turnOf = (id: string) => turns.find((turn) => turn.playerId === id)!.turnSeq
    return { ...played, base, turnOf }
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  it('내 차례의 음성만 올릴 수 있고, 재전송은 중복으로 알려준다', async () => {
    const { base, host, turnOf } = await start()
    const url = `${base}/api/sessions/S1/turns/${turnOf(host)}/chunks/0`

    expect((await fetch(url, { method: 'POST', body: bytes(1, 2) })).status).toBe(401)
    expect((await fetch(url, { method: 'POST', headers: auth('t2'), body: bytes(1, 2) })).status).toBe(403)

    const first = await fetch(url, { method: 'POST', headers: auth('t1'), body: bytes(1, 2) })
    expect(await first.json()).toEqual({ ok: true, duplicate: false })
    const again = await fetch(url, { method: 'POST', headers: auth('t1'), body: bytes(1, 2) })
    expect(await again.json()).toEqual({ ok: true, duplicate: true })

    const complete = await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/complete`, {
      method: 'POST',
      headers: { ...auth('t1'), 'content-type': 'application/json' },
      body: JSON.stringify({ chunks: 1, durationMs: 2_000, silent: false, failed: false, audioStartMs: 150 }),
    })
    expect(complete.status).toBe(200)
    expect(store.turn('S1', turnOf(host))?.report?.durationMs).toBe(2_000)
  })

  it('음성 없이 참여한 사람은 올릴 수 없고, 너무 큰 조각과 잘못된 보고는 거부한다', async () => {
    const { base, host, eugene, turnOf } = await start()
    expect((await fetch(`${base}/api/sessions/S1/turns/${turnOf(eugene)}/chunks/0`, { method: 'POST', headers: auth('t3'), body: bytes(1) })).status).toBe(403)
    const big = new Uint8Array(1024 * 1024 + 1)
    expect((await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/chunks/0`, { method: 'POST', headers: auth('t1'), body: big })).status).toBe(413)
    const bad = await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/complete`, { method: 'POST', headers: auth('t1'), body: '{"chunks":-1}' })
    expect(bad.status).toBe(400)
  })

  it('복기와 음성은 세션이 끝난 뒤, 그 세션 참가자에게만 준다', async () => {
    const { base, host, room, turnOf } = await start()
    await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/chunks/0`, { method: 'POST', headers: auth('t1'), body: bytes(8, 9) })

    // 게임 중에는 아무도 볼 수 없다.
    expect((await fetch(`${base}/api/sessions/S1/replay`, { headers: auth('t1') })).status).toBe(403)
    expect((await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/audio`, { headers: auth('t2') })).status).toBe(403)

    room.handle(host, { type: 'session.end' })
    expect((await fetch(`${base}/api/sessions/S1/replay`)).status).toBe(401)
    const replay = (await (await fetch(`${base}/api/sessions/S1/replay`, { headers: auth('t2') })).json()) as { replay: ReplayData }
    expect(replay.replay.hands[0].players).toHaveLength(3)

    const audio = await fetch(`${base}/api/sessions/S1/turns/${turnOf(host)}/audio`, { headers: auth('t2') })
    expect(audio.headers.get('content-type')).toBe('audio/webm')
    expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([8, 9])
    expect((await fetch(`${base}/api/sessions/NOPE/replay`, { headers: auth('t1') })).status).toBe(404)
  })

  it('복기에는 내가 표시한 핸드만 오고, 끝난 세션은 복기 화면에서 표시를 넣고 뺄 수 있다', async () => {
    const { base, host, minsu, room } = await start()
    room.handle(minsu, { type: 'hand.mark', handNumber: 1, marked: true })
    const mark = (method: string, token: string, hand = 1) => fetch(`${base}/api/sessions/S1/marks/${hand}`, { method, headers: auth(token) })
    // 게임 중에는 테이블에서만 표시한다.
    expect((await mark('PUT', 't1')).status).toBe(403)

    room.handle(host, { type: 'session.end' })
    const replayOf = async (token: string) =>
      ((await (await fetch(`${base}/api/sessions/S1/replay`, { headers: auth(token) })).json()) as { replay: ReplayData }).replay.marked
    expect(await replayOf('t2')).toEqual([1])
    expect(await replayOf('t1')).toEqual([])

    expect(await (await mark('PUT', 't1')).json()).toEqual({ ok: true, marked: [1] })
    expect(await replayOf('t1')).toEqual([1])
    expect(await (await mark('DELETE', 't1')).json()).toEqual({ ok: true, marked: [] })
    expect((await mark('PUT', 't1', 99)).status).toBe(404)
    expect((await fetch(`${base}/api/sessions/S1/marks/1`, { method: 'PUT' })).status).toBe(401)
  })

  it('허용한 Origin에만 CORS를 열고, 나머지 Origin은 막는다', async () => {
    const { base } = await start()
    const preflight = await fetch(`${base}/api/sessions/S1/replay`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect((await fetch(`${base}/api/sessions/S1/replay`, { headers: { origin: 'https://evil.example', ...auth('t1') } })).status).toBe(403)
  })

  it('화면 폴더를 주면 파일을 제공하고, 없는 경로는 index.html로, 폴더 밖은 막는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bwp-static-'))
    try {
      mkdirSync(join(dir, 'assets'))
      writeFileSync(join(dir, 'index.html'), '<!doctype html>앱')
      writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)')
      writeFileSync(join(dir, 'assets', 'postflop-123.wasm'), new Uint8Array([0, 97, 115, 109]))
      const { base } = await start({ staticDir: dir })

      const asset = await fetch(`${base}/assets/app-123.js`)
      expect(asset.headers.get('content-type')).toContain('text/javascript')
      expect(asset.headers.get('cache-control')).toContain('immutable')
      expect((await fetch(`${base}/assets/postflop-123.wasm`)).headers.get('content-type')).toBe('application/wasm')
      const page = await fetch(`${base}/?room=ABC234`)
      expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin')
      expect(page.headers.get('cross-origin-embedder-policy')).toBe('require-corp')
      expect(await page.text()).toContain('앱')
      expect(await (await fetch(`${base}/some/page`)).text()).toContain('앱')
      expect(await (await fetch(`${base}/..%2F..%2Fpackage.json`)).text()).toContain('앱')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
