import { afterEach, describe, expect, it } from 'vitest'
import { seededRng } from '@banwonpoker/engine'
import { WebSocket } from 'ws'
import type { ClientMessage, ClientState, ServerMessage } from './protocol'
import { parseClientMessage } from './protocol'
import { isAllowedOrigin, startGameServer, WS_PATH } from './server'
import type { GameServer } from './server'
import { agreed, fixedSettings } from './testing'

let server: GameServer | undefined
const sockets: WebSocket[] = []

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate()
  await server?.close()
  server = undefined
})

async function start() {
  server = await startGameServer({
    port: 0,
    manager: { newCode: () => 'ABC234', rngFactory: () => seededRng(3), roomOptions: { nextHandDelayMs: 50 } },
  })
  return server
}

/** 테스트 클라이언트: 받은 메시지를 모아 두고 조건이 맞는 메시지를 기다린다. */
async function client(port: number, origin?: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`, origin ? { origin } : undefined)
  sockets.push(socket)
  const received: ServerMessage[] = []
  const waiters: Array<{ match: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void }> = []
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage
    // 기다리던 메시지면 넘겨주고 끝낸다. 아니면 나중에 찾을 수 있게 쌓아 둔다.
    const waiter = waiters.find((item) => item.match(message))
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(message)
      return
    }
    received.push(message)
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })

  const waitFor = <T extends ServerMessage['type']>(type: T, match: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true) =>
    new Promise<Extract<ServerMessage, { type: T }>>((resolve, reject) => {
      const matcher = (message: ServerMessage) => message.type === type && match(message as Extract<ServerMessage, { type: T }>)
      const already = received.find(matcher)
      if (already) {
        received.splice(received.indexOf(already), 1)
        resolve(already as Extract<ServerMessage, { type: T }>)
        return
      }
      const timer = setTimeout(() => reject(new Error(`${type} 메시지를 기다리다 시간이 지났습니다.`)), 3_000)
      waiters.push({
        match: matcher,
        resolve: (message) => {
          clearTimeout(timer)
          resolve(message as Extract<ServerMessage, { type: T }>)
        },
      })
    })

  const send = (message: ClientMessage | Record<string, unknown> | string) =>
    socket.send(typeof message === 'string' ? message : JSON.stringify(message))

  /** 조건을 만족하는 상태가 올 때까지 기다린다. */
  const stateWhere = (predicate: (state: ClientState) => boolean) =>
    waitFor('state', (message) => predicate(message.state)).then((message) => message.state)

  return { socket, send, waitFor, stateWhere, received }
}

describe('게임 서버(WebSocket)', () => {
  it('헬스 체크에 응답한다', async () => {
    const { port } = await start()
    const response = await fetch(`http://127.0.0.1:${port}/health`)
    expect(await response.json()).toEqual({ ok: true, rooms: 0 })
    expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404)
  })

  it('세 사람이 방을 만들고 들어와 준비하고, 한 판을 진행한다', async () => {
    const { port, manager } = await start()
    const host = await client(port)
    host.send({ type: 'room.create', nickname: '하늘', settings: fixedSettings })
    const created = await host.waitFor('joined')
    expect(created).toMatchObject({ roomCode: 'ABC234', protocolVersion: 1 })
    expect(created.token).toMatch(/^[0-9a-f]{48}$/)

    const minsu = await client(port)
    minsu.send({ type: 'room.join', roomCode: 'abc-234', nickname: '민수' })
    const minsuJoined = await minsu.waitFor('joined')
    const eugene = await client(port)
    eugene.send({ type: 'room.join', roomCode: 'ABC234', nickname: '유진' })
    await eugene.waitFor('joined')
    await host.stateWhere((state) => state.room.participants.length === 3)

    ;[host, minsu, eugene].forEach((player, seat) => {
      player.send({ type: 'seat.take', seat })
      player.send({ type: 'ready.set', ready: true, consent: agreed, voiceless: false })
    })
    await host.stateWhere((state) => state.room.participants.every((participant) => participant.ready))
    host.send({ type: 'game.start' })

    const hostGame = await host.stateWhere((state) => state.game?.view.handNumber === 1)
    const minsuGame = await minsu.stateWhere((state) => state.game?.view.handNumber === 1)
    const hostCards = hostGame.game!.view.seats.find((seat) => seat.id === hostGame.you.playerId)!.holeCards!
    expect(hostCards).toHaveLength(2)
    expect(minsuGame.game!.view.seats.find((seat) => seat.id === hostGame.you.playerId)!.holeCards).toBeNull()
    expect(hostGame.game!.turn?.playerId).toBe(hostGame.you.playerId)

    // 하늘 레이즈 → 민수 폴드 → 유진 폴드 → 하늘이 팟을 가져간다.
    host.send({ type: 'action', clientActionId: 'h1', action: { type: 'raise', amount: 300 } })
    expect(await host.waitFor('action.result')).toMatchObject({ clientActionId: 'h1', ok: true })
    minsu.send({ type: 'action', clientActionId: 'm1', action: { type: 'fold' } })
    await minsu.waitFor('action.result', (message) => message.clientActionId === 'm1')
    eugene.send({ type: 'action', clientActionId: 'e1', action: { type: 'fold' } })

    const settled = await host.stateWhere((state) => state.game?.view.phase === 'complete')
    expect(settled.game!.view.seats.find((seat) => seat.id === settled.you.playerId)?.stack).toBe(10_150)

    // 잠깐 쉬고 다음 핸드
    await host.stateWhere((state) => state.game?.view.handNumber === 2)

    // 연결이 끊겼다가 토큰으로 돌아오면 같은 자리
    minsu.socket.terminate()
    await host.stateWhere((state) => state.room.participants.some((participant) => participant.nickname === '민수' && !participant.connected))
    const back = await client(port)
    back.send({ type: 'room.resume', roomCode: 'ABC234', token: minsuJoined.token })
    expect(await back.waitFor('joined')).toMatchObject({ playerId: minsuJoined.playerId })
    const resumed = await back.stateWhere((state) => state.game !== null)
    expect(resumed.game!.view.seats.find((seat) => seat.id === minsuJoined.playerId)?.holeCards).toHaveLength(2)
    expect(manager.size).toBe(1)
  })

  it('잘못된 메시지와 순서를 거부한다', async () => {
    const { port } = await start()
    const player = await client(port)

    player.send('not json')
    expect((await player.waitFor('error')).error.code).toBe('BAD_REQUEST')
    player.send({ type: 'seat.take', seat: 0 })
    expect((await player.waitFor('error')).error.code).toBe('NOT_JOINED')
    player.send({ type: 'room.join', roomCode: 'ZZZZZZ', nickname: '민수' })
    expect((await player.waitFor('error')).error.code).toBe('ROOM_NOT_FOUND')
    player.send({ type: 'room.resume', roomCode: 'ZZZZZZ', token: 'nope' })
    expect((await player.waitFor('error')).error.code).toBe('INVALID_TOKEN')
    player.send({ type: 'ping' })
    expect(await player.waitFor('pong')).toMatchObject({ type: 'pong' })

    player.send({ type: 'room.create', nickname: '하늘', settings: fixedSettings })
    await player.waitFor('joined')
    player.send({ type: 'room.create', nickname: '하늘', settings: fixedSettings })
    expect((await player.waitFor('error')).error.code).toBe('ALREADY_JOINED')
  })

  it('허용하지 않은 Origin의 연결은 받지 않는다', async () => {
    const { port } = await start()
    await expect(client(port, 'https://evil.example')).rejects.toThrow()
    await expect(client(port, 'http://localhost:5173')).resolves.toBeDefined()
  })
})

describe('parseClientMessage', () => {
  it('형식이 맞는 메시지만 통과시키고 모르는 필드는 버린다', () => {
    expect(parseClientMessage({ type: 'seat.take', seat: 2, extra: 'x' })).toEqual({ ok: true, message: { type: 'seat.take', seat: 2 } })
    expect(parseClientMessage({ type: 'action', clientActionId: 'a', action: { type: 'raise', amount: 300, hack: 1 } })).toEqual({
      ok: true,
      message: { type: 'action', clientActionId: 'a', action: { type: 'raise', amount: 300 } },
    })
  })

  it.each([
    null,
    [],
    'x',
    { type: 'nope' },
    { type: 'seat.take', seat: '1' },
    { type: 'seat.take', seat: 1.5 },
    { type: 'action', clientActionId: '', action: { type: 'fold' } },
    { type: 'action', clientActionId: 'a', action: { type: 'raise' } },
    { type: 'action', clientActionId: 'a', action: { type: 'all-in' } },
    { type: 'ready.set', ready: true, voiceless: false, consent: { recording: 'yes', reveal: true } },
    { type: 'room.create', nickname: '하늘', settings: { ...fixedSettings, levels: [] } },
    { type: 'room.create', nickname: 'x'.repeat(65), settings: fixedSettings },
    { type: 'room.join', roomCode: 'A'.repeat(17), nickname: '민수' },
  ])('%j → 거부', (input) => {
    expect(parseClientMessage(input)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } })
  })
})

describe('isAllowedOrigin', () => {
  it('같은 주소, 목록에 있는 주소, 목록이 비었을 때 localhost만 허용한다', () => {
    expect(isAllowedOrigin(undefined, [])).toBe(true)
    expect(isAllowedOrigin('https://bwp.fly.dev', [], 'bwp.fly.dev')).toBe(true)
    expect(isAllowedOrigin('https://evil.example', [], 'bwp.fly.dev')).toBe(false)
    expect(isAllowedOrigin('http://localhost:5173', [])).toBe(true)
    expect(isAllowedOrigin('http://192.168.0.12:5173', ['http://192.168.0.12:5173'])).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', ['http://192.168.0.12:5173'])).toBe(false)
    expect(isAllowedOrigin('not a url', [])).toBe(false)
  })
})
