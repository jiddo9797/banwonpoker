import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { systemClock } from './clock'
import type { Clock } from './clock'
import { RoomManager } from './manager'
import type { ManagerDeps } from './manager'
import { parseClientMessage } from './protocol'
import type { ClientMessage, ErrorBody, ServerMessage } from './protocol'
import type { Room, Send } from './room'

export const WS_PATH = '/ws'
const MAX_MESSAGE_BYTES = 16 * 1024
const HEARTBEAT_MS = 30_000

export interface GameServerOptions {
  port?: number
  host?: string
  /** 허용할 Origin 목록. 비우면 localhost·127.0.0.1과 Origin 없는 요청(도구)만 허용한다. */
  allowedOrigins?: string[]
  clock?: Clock
  manager?: Omit<ManagerDeps, 'clock'>
}

export interface GameServer {
  port: number
  http: Server
  manager: RoomManager
  close(): Promise<void>
}

function isAllowedOrigin(origin: string | undefined, allowed: string[]) {
  if (!origin) return true
  if (allowed.includes(origin)) return true
  if (allowed.length > 0) return false
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/** HTTP(헬스 체크)와 WebSocket(/ws) 게임 서버를 연다. */
export function startGameServer(options: GameServerOptions = {}): Promise<GameServer> {
  const clock = options.clock ?? systemClock
  const manager = new RoomManager({ clock, ...options.manager })
  const allowedOrigins = options.allowedOrigins ?? []

  const http = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, rooms: manager.size }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: false }))
  })

  const wss = new WebSocketServer({
    server: http,
    path: WS_PATH,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => isAllowedOrigin(req.headers.origin, allowedOrigins),
  })

  const alive = new WeakMap<WebSocket, boolean>()
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate()
        continue
      }
      alive.set(socket, false)
      socket.ping()
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()

  wss.on('connection', (socket) => {
    alive.set(socket, true)
    socket.on('pong', () => alive.set(socket, true))

    let binding: { room: Room; playerId: string } | null = null
    const send: Send = (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }
    const sendError = (error: ErrorBody, requestType?: string) => send({ type: 'error', error, requestType })

    const bind = (room: Room, playerId: string) => {
      binding = { room, playerId }
      room.attach(playerId, send, () => {
        binding = null
        socket.close(4000, 'replaced')
      })
    }

    const route = (message: ClientMessage) => {
      if (message.type === 'room.create' || message.type === 'room.join' || message.type === 'room.resume') {
        if (binding) return sendError({ code: 'ALREADY_JOINED', message: '이미 방에 들어와 있습니다.' }, message.type)
      }

      switch (message.type) {
        case 'room.create': {
          const created = manager.create(message.nickname, message.settings)
          if (!created.ok) return sendError(created.error, message.type)
          return bind(created.room, created.playerId)
        }
        case 'room.join': {
          const room = manager.get(message.roomCode)
          if (!room) return sendError({ code: 'ROOM_NOT_FOUND', message: '방을 찾을 수 없습니다. 초대 링크를 확인하세요.' }, message.type)
          const joined = room.join(message.nickname)
          if (!joined.ok) return sendError(joined.error, message.type)
          return bind(room, joined.value.playerId)
        }
        case 'room.resume': {
          const room = manager.get(message.roomCode)
          const playerId = room?.findByToken(message.token)
          if (!room || !playerId) return sendError({ code: 'INVALID_TOKEN', message: '다시 들어올 수 없습니다. 새로 입장하세요.' }, message.type)
          return bind(room, playerId)
        }
        case 'ping':
          if (!binding) return send({ type: 'pong', serverTime: clock.now() })
          break
        default:
          break
      }

      if (!binding) return sendError({ code: 'NOT_JOINED', message: '먼저 방에 들어오세요.' }, message.type)
      const { room, playerId } = binding
      room.handle(playerId, message)
      if (message.type === 'room.leave') binding = null
    }

    socket.on('message', (data, isBinary) => {
      if (isBinary) return sendError({ code: 'BAD_REQUEST', message: 'JSON 텍스트만 받습니다.' })
      let json: unknown
      try {
        json = JSON.parse(data.toString())
      } catch {
        return sendError({ code: 'BAD_REQUEST', message: 'JSON 형식이 아닙니다.' })
      }
      const parsed = parseClientMessage(json)
      if (!parsed.ok) return sendError(parsed.error)
      route(parsed.message)
    })

    socket.on('close', () => {
      if (binding) binding.room.detach(binding.playerId, send)
      binding = null
    })
  })

  return new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port ?? 8787, options.host ?? '127.0.0.1', () => {
      const address = http.address() as AddressInfo
      resolve({
        port: address.port,
        http,
        manager,
        close: () =>
          new Promise((done) => {
            clearInterval(heartbeat)
            for (const socket of wss.clients) socket.terminate()
            wss.close(() => http.close(() => done()))
          }),
      })
    })
  })
}
