import type { ClientState, ServerMessage } from '@banwonpoker/server/protocol'
import { describe, expect, it } from 'vitest'
import { LiveClient, SESSION_KEY } from './client'

class FakeSocket {
  readyState: 0 | 1 | 2 | 3 = 0
  sent: unknown[] = []
  closed = false
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.closed = true
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }
  drop() {
    this.readyState = 3
    this.onclose?.({} as CloseEvent)
  }
}

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

function setup(storages: MemoryStorage[] = [new MemoryStorage(), new MemoryStorage()]) {
  const sockets: FakeSocket[] = []
  const timers: Array<() => void> = []
  let now = 1_000
  const client = new LiveClient({
    url: 'ws://test/ws',
    storage: storages,
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    now: () => now,
    setTimer: (callback) => timers.push(callback),
    clearTimer: () => undefined,
  })
  return {
    client,
    sockets,
    storages,
    runTimers: () => timers.splice(0).forEach((callback) => callback()),
    setNow: (value: number) => {
      now = value
    },
  }
}

const state = (overrides: Partial<ClientState> = {}): ClientState =>
  ({
    serverTime: 5_000,
    room: { code: 'ABC234', sessionId: null, name: '방', hostId: 'p1', phase: 'lobby', settings: {} as never, participants: [], summary: null },
    you: { playerId: 'p1', isHost: true, seat: null, ready: false, voiceless: false },
    game: null,
    ...overrides,
  }) as ClientState

describe('LiveClient', () => {
  it('연결 전 요청은 모았다가 열리면 보낸다', () => {
    const { client, sockets } = setup()
    client.joinRoom('ABC234', '민수')
    expect(client.getSnapshot().status).toBe('connecting')
    expect(sockets).toHaveLength(1)
    sockets[0].open()
    expect(sockets[0].sent).toEqual([{ type: 'room.join', roomCode: 'ABC234', nickname: '민수' }])
    expect(client.getSnapshot().status).toBe('open')
  })

  it('입장하면 토큰을 탭 전용·브라우저 공용 저장소에 모두 저장하고, 서버 시각 차이를 기억한다', () => {
    const { client, sockets, storages } = setup()
    client.createRoom('하늘', {} as never)
    sockets[0].open()
    sockets[0].receive({ type: 'joined', roomCode: 'ABC234', playerId: 'p1', token: 'secret', protocolVersion: 1 })
    sockets[0].receive({ type: 'state', state: state() })

    const saved = JSON.parse(storages[0].getItem(SESSION_KEY)!)
    expect(saved).toEqual({ roomCode: 'ABC234', token: 'secret', playerId: 'p1' })
    expect(storages[1].getItem(SESSION_KEY)).toBe(storages[0].getItem(SESSION_KEY))
    expect(client.getSnapshot()).toMatchObject({ clockOffset: 4_000, state: { room: { code: 'ABC234' } } })
  })

  it('저장소가 여럿이면 앞(탭 전용)에 있는 것을 먼저 읽는다', () => {
    const tab = new MemoryStorage()
    const shared = new MemoryStorage()
    tab.setItem(SESSION_KEY, JSON.stringify({ roomCode: 'TABTAB', token: 't1', playerId: 'p1' }))
    shared.setItem(SESSION_KEY, JSON.stringify({ roomCode: 'SHARED', token: 't2', playerId: 'p2' }))
    expect(setup([tab, shared]).client.savedSession?.roomCode).toBe('TABTAB')
    expect(setup([new MemoryStorage(), shared]).client.savedSession?.roomCode).toBe('SHARED')
  })

  it('이벤트는 순번으로 중복을 걸러 쌓는다', () => {
    const { client, sockets } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    const event = (seq: number) => ({ type: 'hole-cards-dealt' as const, handNumber: 1, seq, sessionTimeMs: 0 })
    sockets[0].receive({ type: 'events', events: [event(1), event(2)] })
    sockets[0].receive({ type: 'events', events: [event(2), event(3)] })
    expect(client.getSnapshot().events.map((item) => item.seq)).toEqual([1, 2, 3])
  })

  it('서버 확인 전에는 다른 액션을 보내지 않고, 거절되면 이유를 남긴다', () => {
    const { client, sockets } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    client.act('raise', { type: 'raise', amount: 150 })
    client.act('fold', { type: 'fold' })
    const actions = sockets[0].sent.filter((message) => (message as { type: string }).type === 'action')
    expect(actions).toHaveLength(1)
    const { clientActionId } = actions[0] as { clientActionId: string }
    expect(client.getSnapshot().pending).toEqual({ clientActionId, slot: 'raise' })

    sockets[0].receive({ type: 'action.result', clientActionId, ok: false, error: { code: 'ACTION_REJECTED', message: '최소 레이즈는 200입니다.' } })
    expect(client.getSnapshot().pending).toBeNull()
    expect(client.getSnapshot().lastError).toMatchObject({ requestType: 'action', error: { message: '최소 레이즈는 200입니다.' } })
  })

  it('방에 들어가기 전에 서버에 닿지 못하면 요청을 버리고 알린다', () => {
    const { client, sockets, runTimers } = setup()
    client.createRoom('하늘', {} as never)
    sockets[0].drop()
    runTimers()
    expect(sockets).toHaveLength(1)
    expect(client.getSnapshot()).toMatchObject({
      status: 'closed',
      lastError: { requestType: 'room.create', error: { code: 'CONNECTION_FAILED' } },
    })
  })

  it('게임 중 연결이 끊기면 다시 연결해 토큰으로 같은 자리에 돌아간다', () => {
    const { client, sockets, runTimers } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    sockets[0].receive({ type: 'joined', roomCode: 'ABC234', playerId: 'p2', token: 'tok', protocolVersion: 1 })
    sockets[0].receive({ type: 'state', state: state() })

    sockets[0].drop()
    expect(client.getSnapshot().status).toBe('reconnecting')
    runTimers()
    sockets[1].open()
    expect(sockets[1].sent[0]).toEqual({ type: 'room.resume', roomCode: 'ABC234', token: 'tok' })
  })

  it('다른 탭이 자리를 가져가면 자동 재접속을 멈추고, 다시 열기를 누르면 돌아간다', () => {
    const { client, sockets, runTimers } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    sockets[0].receive({ type: 'joined', roomCode: 'ABC234', playerId: 'p2', token: 'tok', protocolVersion: 1 })
    sockets[0].receive({ type: 'state', state: state() })
    sockets[0].receive({ type: 'error', error: { code: 'SESSION_REPLACED', message: '...' } })
    sockets[0].drop()
    runTimers()

    expect(sockets).toHaveLength(1)
    expect(client.getSnapshot()).toMatchObject({ replaced: true, state: null })
    client.resumeSaved()
    sockets[1].open()
    expect(sockets[1].sent[0]).toEqual({ type: 'room.resume', roomCode: 'ABC234', token: 'tok' })
    expect(client.getSnapshot().replaced).toBe(false)
  })

  it('방장이 내보내면 저장을 지우고 다시 연결하지 않는다', () => {
    const { client, sockets, storages, runTimers } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    sockets[0].receive({ type: 'joined', roomCode: 'ABC234', playerId: 'p2', token: 'tok', protocolVersion: 1 })
    sockets[0].receive({ type: 'state', state: state() })
    sockets[0].receive({ type: 'error', error: { code: 'KICKED', message: '방장이 방에서 내보냈습니다.' } })
    sockets[0].drop()
    runTimers()

    expect(sockets).toHaveLength(1)
    expect(client.getSnapshot()).toMatchObject({ kicked: true, state: null })
    expect(storages.every((storage) => storage.getItem(SESSION_KEY) === null)).toBe(true)
    client.leave()
    expect(client.getSnapshot().kicked).toBe(false)
  })

  it('저장한 자리로 돌아가지 못하면 저장을 지운다', () => {
    const storage = new MemoryStorage()
    storage.setItem(SESSION_KEY, JSON.stringify({ roomCode: 'GONE00', token: 'old', playerId: 'p9' }))
    const { client, sockets } = setup([storage])
    expect(client.resumeSaved()).toBe(true)
    sockets[0].open()
    sockets[0].receive({ type: 'error', requestType: 'room.resume', error: { code: 'INVALID_TOKEN', message: '다시 들어올 수 없습니다.' } })
    expect(storage.getItem(SESSION_KEY)).toBeNull()
    expect(client.getSnapshot()).toMatchObject({ resuming: false, state: null })
  })

  it('나가면 서버에 알리고 저장을 지운 뒤 연결을 닫는다', () => {
    const { client, sockets, storages } = setup()
    client.joinRoom('ABC234', '민수')
    sockets[0].open()
    sockets[0].receive({ type: 'joined', roomCode: 'ABC234', playerId: 'p2', token: 'tok', protocolVersion: 1 })
    sockets[0].receive({ type: 'state', state: state() })
    client.leave()
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'room.leave' })
    expect(sockets[0].closed).toBe(true)
    expect(storages.every((storage) => storage.getItem(SESSION_KEY) === null)).toBe(true)
    expect(client.getSnapshot()).toMatchObject({ status: 'idle', state: null })
  })
})
