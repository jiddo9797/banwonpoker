import type { ReplayData } from '@banwonpoker/server/protocol'
import { describe, expect, it } from 'vitest'
import { HISTORY_KEY, readHistory, rememberSession } from './history'
import { handResult, toReplayHands } from './replayAdapt'
import { encodeWav, handLog } from './replayMedia'

const card = (rank: number, suit: 'spade' | 'heart' | 'diamond' | 'club') => ({ rank: rank as never, suit })

const replay: ReplayData = {
  session: {
    id: 'S1',
    name: '금요일 홀덤',
    settings: { name: '금요일 홀덤', maxPlayers: 3, startingStack: 10_000, blindMode: 'fixed', levels: [{ smallBlind: 50, bigBlind: 100 }], levelMinutes: 15 },
    startedAt: 0,
    endedAt: 600_000,
    summary: null,
  },
  participants: [
    { playerId: 'me', nickname: '하늘', voiceless: false },
    { playerId: 'b', nickname: '민수', voiceless: false },
    { playerId: 'c', nickname: '유진', voiceless: true },
  ],
  hands: [
    {
      number: 1,
      dealerSeat: 0,
      blinds: { smallBlind: 50, bigBlind: 100 },
      cancelled: false,
      players: [
        { playerId: 'me', nickname: '하늘', seat: 0, cards: [card(14, 'heart'), card(13, 'heart')], startStack: 10_000 },
        { playerId: 'b', nickname: '민수', seat: 1, cards: [card(7, 'club'), card(7, 'diamond')], startStack: 9_500 },
        // 예전 기록: 시작 칩이 없다
        { playerId: 'c', nickname: '유진', seat: 2, cards: [card(10, 'spade'), card(2, 'club')], startStack: 9_900 },
      ],
      board: [card(13, 'spade'), card(9, 'heart'), card(4, 'heart')],
      streets: [{ street: 'flop', seq: 10 }],
      actions: [
        { seq: 3, street: 'preflop', playerId: 'b', kind: 'blind', amount: 50, to: 50, allIn: false, timedOut: false, pot: 50, sessionTimeMs: 0, thinkMs: null, turnSeq: null, audio: { status: 'none', durationMs: null } },
        { seq: 4, street: 'preflop', playerId: 'c', kind: 'blind', amount: 100, to: 100, allIn: false, timedOut: false, pot: 150, sessionTimeMs: 0, thinkMs: null, turnSeq: null, audio: { status: 'none', durationMs: null } },
        { seq: 7, street: 'preflop', playerId: 'me', kind: 'raise', amount: 300, to: 300, allIn: false, timedOut: false, pot: 450, sessionTimeMs: 4_000, thinkMs: 3_600, turnSeq: 6, audio: { status: 'voice', durationMs: 3_200 } },
        { seq: 9, street: 'preflop', playerId: 'b', kind: 'fold', amount: 0, to: 50, allIn: false, timedOut: true, pot: 450, sessionTimeMs: 64_000, thinkMs: 60_000, turnSeq: 8, audio: { status: 'missing', durationMs: null } },
        { seq: 11, street: 'preflop', playerId: 'c', kind: 'call', amount: 200, to: 300, allIn: false, timedOut: false, pot: 650, sessionTimeMs: 66_000, thinkMs: 2_000, turnSeq: 10, audio: { status: 'voiceless', durationMs: null } },
      ],
      awards: [{ amount: 650, winners: [{ playerId: 'me', amount: 650 }], handName: '킹 원 페어' }],
    },
  ],
  marked: [1],
}

describe('toReplayHands', () => {
  const [hand] = toReplayHands(replay, 'me')

  it('내 좌석을 아래(hero)에 두고 나를 `나`로 부르며 딜러·블라인드를 표시한다', () => {
    expect(hand.players.map((player) => [player.name, player.position, player.badge])).toEqual([
      ['나', 'hero', 'BTN'],
      ['민수', 'top-left', 'SB'],
      ['유진', 'top-right', 'BB'],
    ])
    expect(hand.players[0].cards).toEqual([
      { rank: 'A', suit: 'heart' },
      { rank: 'K', suit: 'heart' },
    ])
  })

  it('내가 표시한 핸드를 알려주고, 표시를 보내지 않는 예전 서버면 표시가 없다', () => {
    expect(hand.marked).toBe(true)
    const { marked: _ignored, ...old } = replay
    expect(toReplayHands(old as ReplayData, 'me')[0].marked).toBe(false)
  })

  it('딜러부터 좌석 번호 순으로 포지션 이름을 붙인다', () => {
    const moved = toReplayHands({ ...replay, hands: [{ ...replay.hands[0], dealerSeat: 1 }] }, 'me')[0]
    expect(moved.players.map((player) => [player.id, player.badge])).toEqual([
      ['me', 'BB'],
      ['b', 'BTN'],
      ['c', 'SB'],
    ])
    expect(moved.bigBlind).toBe(100)
  })

  it('액션을 칸으로 바꾸고 마지막에 결과 칸을 붙인다', () => {
    expect(hand.actions.map((action) => [action.label, action.audio.status, action.audio.seconds, action.thinkSeconds, action.turnSeq])).toEqual([
      ['SB 50', 'none', undefined, undefined, undefined],
      ['BB 100', 'none', undefined, undefined, undefined],
      ['레이즈 300 (3BB)', 'voice', 3, 4, 6],
      ['폴드(시간 초과)', 'missing', undefined, 60, 8],
      ['콜 300 (3BB)', 'voiceless', undefined, 2, 10],
      ['나 승리', 'none', undefined, undefined, undefined],
    ])
    expect(hand.actions.at(-1)).toMatchObject({ kind: 'result', street: 'showdown', pot: 650 })
    expect(hand.result).toBe('나 승리 · 킹 원 페어 +650')
    expect(hand.board).toHaveLength(3)
  })

  it('시작 칩, 받은 칩, 액션마다 낸 칩을 채운다', () => {
    expect(hand.startStacks).toEqual({ me: 10_000, b: 9_500, c: 9_900 })
    expect(hand.payouts).toEqual({ me: 650 })
    expect(hand.actions.map((action) => action.added)).toEqual([50, 100, 300, 0, 200, 0])
  })

  it('무효 핸드는 낸 칩을 그대로 돌려받는다', () => {
    const [cancelled] = toReplayHands({ ...replay, hands: [{ ...replay.hands[0], cancelled: true, awards: [] }] }, 'me')
    expect(cancelled.payouts).toEqual({ b: 50, c: 300, me: 300 })
  })

  it('관전자로 보면 빈 좌석을 기준으로 돌린다', () => {
    const [watched] = toReplayHands(replay, 'nobody')
    expect(watched.players.every((player) => player.position !== 'hero')).toBe(true)
  })

  it('무효 핸드는 그렇게 알린다', () => {
    expect(handResult({ ...replay.hands[0], cancelled: true }, (id) => id)).toBe('무효 · 낸 칩을 모두 돌려받았습니다')
  })
})

describe('encodeWav', () => {
  it('16비트 모노 WAV 머리말과 샘플을 쓴다', async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 24_000)
    const view = new DataView(await wav.arrayBuffer())
    const text = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)))
    expect(wav.type).toBe('audio/wav')
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([0, 32767, -32768, 16383])
  })
})

describe('handLog', () => {
  it('사람이 읽을 수 있는 핸드 기록을 만든다', () => {
    const log = handLog(toReplayHands(replay, 'me'), '금요일 홀덤')
    expect(log).toContain('# 금요일 홀덤')
    expect(log).toContain('## 핸드 #1 · 나 승리 · 킹 원 페어 +650')
    expect(log).toContain('나(A♥ K♥)')
    expect(log).toContain('- [preflop] 나 레이즈 300 (3BB) · 팟 450 · 생각 4초 · 음성 3초')
    expect(log).toContain('유진 콜 300 (3BB) · 팟 650 · 생각 2초 · 음성 없이 참여')
    expect(log).not.toContain('나 승리 · 팟')
  })
})

describe('history', () => {
  class MemoryStorage {
    data = new Map<string, string>()
    getItem(key: string) {
      return this.data.get(key) ?? null
    }
    setItem(key: string, value: string) {
      this.data.set(key, value)
    }
  }

  it('끝난 세션을 최신순으로 20개까지 남기고 같은 세션은 한 번만 둔다', () => {
    const storage = new MemoryStorage()
    for (let index = 0; index < 25; index += 1) {
      rememberSession({ sessionId: `S${index}`, token: 't', playerId: 'p', name: `방${index}`, endedAt: index }, storage)
    }
    rememberSession({ sessionId: 'S10', token: 't', playerId: 'p', name: '다시', endedAt: 99 }, storage)
    const history = readHistory(storage)
    expect(history).toHaveLength(20)
    expect(history[0]).toMatchObject({ sessionId: 'S10', name: '다시' })
    expect(history.filter((item) => item.sessionId === 'S10')).toHaveLength(1)
  })

  it('깨진 저장값은 비어 있는 것으로 본다', () => {
    const storage = new MemoryStorage()
    storage.setItem(HISTORY_KEY, '{nope')
    expect(readHistory(storage)).toEqual([])
  })
})
