import { seededRng } from '@banwonpoker/engine'
import { FakeClock } from './clock'
import type { ClientMessage, ClientState, RoomSettings, ServerMessage } from './protocol'
import { Room } from './room'
import type { RoomOptions, Send } from './room'

export const fixedSettings: RoomSettings = {
  name: '금요일 밤 홀덤',
  maxPlayers: 6,
  startingStack: 10_000,
  blindMode: 'fixed',
  levels: [{ smallBlind: 50, bigBlind: 100 }],
  levelMinutes: 15,
}

export const agreed = { recording: true, reveal: true }

/** 테스트용 방: 가짜 시계, 고정 시드, 예측 가능한 id(p1, p2, …)와 토큰(t1, t2, …) */
export function setupRoom(settings: RoomSettings = fixedSettings, options: RoomOptions = {}) {
  const clock = new FakeClock()
  let count = 0
  const closed: string[] = []
  const inbox = new Map<string, ServerMessage[]>()
  const senders = new Map<string, Send>()

  const deps = {
    clock,
    rng: seededRng(7),
    newId: () => `p${++count}`,
    newToken: () => `t${count}`,
    options: { turnMs: 60_000, nextHandDelayMs: 5_000, idleCloseMs: 600_000, ...options },
    onClose: (code: string) => closed.push(code),
  }
  const created = Room.create('ROOM01', '하늘', settings, deps)
  if (!created.ok) throw new Error(created.error.message)
  const { room, playerId: hostId } = created.value

  const connect = (playerId: string) => {
    const box: ServerMessage[] = []
    inbox.set(playerId, box)
    const send: Send = (message) => box.push(message)
    senders.set(playerId, send)
    room.attach(playerId, send)
    return send
  }

  const disconnect = (playerId: string) => room.detach(playerId, senders.get(playerId) as Send)

  const join = (nickname: string) => {
    const joined = room.join(nickname)
    if (!joined.ok) throw new Error(joined.error.message)
    connect(joined.value.playerId)
    return joined.value.playerId
  }

  const send = (playerId: string, message: ClientMessage) => room.handle(playerId, message)

  /** 좌석에 앉고 동의 후 준비한다. */
  const prepare = (playerId: string, seat: number) => {
    send(playerId, { type: 'seat.take', seat })
    send(playerId, { type: 'ready.set', ready: true, consent: agreed, voiceless: false })
  }

  const messages = (playerId: string) => inbox.get(playerId) ?? []

  const state = (playerId: string): ClientState => {
    const found = messages(playerId).filter((message) => message.type === 'state').at(-1)
    if (!found || found.type !== 'state') throw new Error(`${playerId}가 받은 상태가 없습니다.`)
    return found.state
  }

  const lastError = (playerId: string) => {
    const found = messages(playerId).filter((message) => message.type === 'error').at(-1)
    return found?.type === 'error' ? found.error : undefined
  }

  const actionResult = (playerId: string, clientActionId: string) =>
    messages(playerId).filter((message) => message.type === 'action.result' && message.clientActionId === clientActionId)

  const events = (playerId: string) =>
    messages(playerId).flatMap((message) => (message.type === 'events' ? message.events : []))

  const clearInbox = () => {
    for (const box of inbox.values()) box.length = 0
  }

  connect(hostId)

  return { room, clock, hostId, closed, connect, disconnect, join, send, prepare, messages, state, lastError, actionResult, events, clearInbox }
}

/** 세 사람(하늘·민수·유진)이 준비하고 게임을 시작한 방 */
export function startedRoom(settings: RoomSettings = fixedSettings, options: RoomOptions = {}) {
  const harness = setupRoom(settings, options)
  const minsu = harness.join('민수')
  const eugene = harness.join('유진')
  harness.prepare(harness.hostId, 0)
  harness.prepare(minsu, 1)
  harness.prepare(eugene, 2)
  harness.send(harness.hostId, { type: 'game.start' })
  return { ...harness, minsu, eugene }
}
