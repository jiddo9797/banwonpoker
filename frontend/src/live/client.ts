import type { PlayerAction } from '@banwonpoker/engine'
import type {
  ClientMessage,
  ClientState,
  ErrorBody,
  RoomSettings,
  ServerMessage,
  TimedEvent,
} from '@banwonpoker/server/protocol'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/** 화면의 네 가지 고정 액션 슬롯 */
export type ActionSlot = 'call' | 'raise' | 'check' | 'fold'

export interface LiveError {
  /** 서버가 보낸 오류, 또는 서버에 닿지 못했을 때의 CONNECTION_FAILED */
  error: ErrorBody | { code: 'CONNECTION_FAILED'; message: string }
  /** 어떤 요청에 대한 오류인지. action이면 액션 거절 */
  requestType?: string
  /** 같은 오류가 다시 와도 새로 알릴 수 있게 붙이는 번호 */
  id: number
}

export interface LiveSnapshot {
  status: ConnectionStatus
  state: ClientState | null
  /** 이번 연결에서 받은 엔진 이벤트(순번 순, 중복 없음) */
  events: TimedEvent[]
  lastError: LiveError | null
  /** 서버 확인을 기다리는 액션(중복 입력 잠금) */
  pending: { clientActionId: string; slot: ActionSlot } | null
  /** 서버 시각 - 내 시각(ms). 타이머를 서버 기준으로 센다. */
  clockOffset: number
  /** 저장된 방에 다시 들어가는 중인지 */
  resuming: boolean
  /** 다른 탭·기기에서 같은 자리로 들어와 이 탭의 연결이 끊겼는지 */
  replaced: boolean
}

export interface SavedSession {
  roomCode: string
  token: string
  playerId: string
}

export const SESSION_KEY = 'banwonpoker.session'
const MAX_EVENTS = 400
const RECONNECT_DELAYS = [500, 1_000, 2_000, 4_000, 5_000]

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface LiveClientOptions {
  url: string
  /**
   * 재접속 토큰을 저장할 곳. 앞에 있는 곳을 먼저 읽고, 저장은 모두에 한다.
   * 탭 전용(sessionStorage) → 브라우저 공용(localStorage) 순서로 두면 한 브라우저의 여러 탭이 서로 덮어쓰지 않는다.
   */
  storage?: StorageLike | Array<StorageLike | null> | null
  createSocket?: (url: string) => SocketLike
  now?: () => number
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const OPEN = 1

function storagesOf(storage: LiveClientOptions['storage']): StorageLike[] {
  if (!storage) return []
  return (Array.isArray(storage) ? storage : [storage]).filter((item): item is StorageLike => item !== null)
}

function readSession(storages: StorageLike[]): SavedSession | null {
  for (const storage of storages) {
    try {
      const raw = storage.getItem(SESSION_KEY)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<SavedSession>
      if (parsed.roomCode && parsed.token && parsed.playerId) return parsed as SavedSession
    } catch {
      // 읽을 수 없는 곳은 건너뛴다.
    }
  }
  return null
}

/**
 * 게임 서버와의 연결. 화면은 subscribe/getSnapshot으로 상태를 읽고,
 * 요청 메서드로 서버에 보낸다. 연결이 끊기면 저장한 토큰으로 자동으로 다시 들어간다.
 */
export class LiveClient {
  private readonly options: Required<Omit<LiveClientOptions, 'storage'>>
  private readonly storages: StorageLike[]
  private socket: SocketLike | null = null
  private queue: ClientMessage[] = []
  private listeners = new Set<() => void>()
  private snapshot: LiveSnapshot = {
    status: 'idle',
    state: null,
    events: [],
    lastError: null,
    pending: null,
    clockOffset: 0,
    resuming: false,
    replaced: false,
  }
  private session: SavedSession | null
  private reconnectAttempt = 0
  private reconnectTimer: unknown = null
  private intentionalClose = false
  private errorCount = 0
  private actionCount = 0

  constructor(options: LiveClientOptions) {
    this.options = {
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      now: () => Date.now(),
      setTimer: (callback, ms) => window.setTimeout(callback, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      ...options,
    }
    this.storages = storagesOf(options.storage)
    this.session = readSession(this.storages)
  }

  // ── 화면용 구독 ────────────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  get savedSession() {
    return this.session
  }

  private update(patch: Partial<LiveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  // ── 요청 ──────────────────────────────────────────────────────

  createRoom(nickname: string, settings: RoomSettings) {
    this.send({ type: 'room.create', nickname, settings })
  }

  joinRoom(roomCode: string, nickname: string) {
    this.send({ type: 'room.join', roomCode, nickname })
  }

  /** 저장한 방으로 다시 들어간다. 저장한 방이 없으면 아무것도 하지 않는다. */
  resumeSaved() {
    if (!this.session) return false
    this.update({ resuming: true, replaced: false })
    this.send({ type: 'room.resume', roomCode: this.session.roomCode, token: this.session.token })
    return true
  }

  /** 액션을 보낸다. 서버 확인을 기다리는 동안에는 다른 액션을 보내지 않는다. */
  act(slot: ActionSlot, action: PlayerAction) {
    if (this.snapshot.pending) return
    this.actionCount += 1
    const clientActionId = `${this.options.now().toString(36)}-${this.actionCount}`
    this.update({ pending: { clientActionId, slot } })
    this.send({ type: 'action', clientActionId, action })
  }

  send(message: ClientMessage) {
    if (this.socket && this.snapshot.status === 'open' && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify(message))
      return
    }
    this.queue.push(message)
    this.connect()
  }

  /** 방에서 나간다. 저장한 토큰을 지우고 연결을 닫는다. */
  leave() {
    if (this.snapshot.state) this.send({ type: 'room.leave' })
    this.forget()
    this.intentionalClose = true
    this.socket?.close()
    this.socket = null
    this.queue = []
    this.update({ status: 'idle', state: null, events: [], pending: null, lastError: null, resuming: false, replaced: false })
  }

  dismissError() {
    this.update({ lastError: null })
  }

  dispose() {
    this.intentionalClose = true
    if (this.reconnectTimer) this.options.clearTimer(this.reconnectTimer)
    this.socket?.close()
    this.socket = null
    this.listeners.clear()
  }

  // ── 연결 ──────────────────────────────────────────────────────

  private connect() {
    if (this.socket && (this.snapshot.status === 'connecting' || this.snapshot.status === 'open')) return
    if (this.reconnectTimer) {
      this.options.clearTimer(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.intentionalClose = false
    this.update({ status: this.snapshot.state ? 'reconnecting' : 'connecting' })

    let socket: SocketLike
    try {
      socket = this.options.createSocket(this.options.url)
    } catch {
      this.onClosed()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.reconnectAttempt = 0
      this.update({ status: 'open' })
      const queued = this.queue
      this.queue = []
      for (const message of queued) socket.send(JSON.stringify(message))
    }
    socket.onmessage = (event) => {
      try {
        this.receive(JSON.parse(String(event.data)) as ServerMessage)
      } catch {
        // 알 수 없는 메시지는 버린다.
      }
    }
    socket.onclose = () => {
      if (this.socket === socket) this.onClosed()
    }
    socket.onerror = () => {
      // close 이벤트가 뒤따르므로 거기서 처리한다.
    }
  }

  private onClosed() {
    this.socket = null
    if (this.intentionalClose) {
      this.update({ status: 'idle' })
      return
    }
    // 방에 들어가 있었다면 다시 연결해 같은 자리로 돌아간다.
    const rejoin = this.session && (this.snapshot.state || this.snapshot.resuming)
    if (!rejoin) {
      // 방에 들어가기 전에 연결하지 못했으면 요청을 버리고 알린다. 나중에 몰래 방이 만들어지는 일을 막는다.
      const requestType = this.queue[0]?.type
      this.queue = []
      this.errorCount += 1
      this.update({
        status: 'closed',
        pending: null,
        lastError: {
          error: { code: 'CONNECTION_FAILED', message: '게임 서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요.' },
          requestType,
          id: this.errorCount,
        },
      })
      return
    }
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt += 1
    this.update({ status: this.snapshot.state ? 'reconnecting' : 'closed', pending: null })
    this.reconnectTimer = this.options.setTimer(() => {
      this.reconnectTimer = null
      if (rejoin && this.session && !this.queue.some((message) => message.type === 'room.resume')) {
        this.queue.unshift({ type: 'room.resume', roomCode: this.session.roomCode, token: this.session.token })
      }
      this.connect()
    }, delay)
  }

  private remember(session: SavedSession) {
    this.session = session
    for (const storage of this.storages) {
      try {
        storage.setItem(SESSION_KEY, JSON.stringify(session))
      } catch {
        // 저장할 수 없어도 이번 연결에서는 계속 플레이할 수 있다.
      }
    }
  }

  private forget() {
    this.session = null
    for (const storage of this.storages) {
      try {
        storage.removeItem(SESSION_KEY)
      } catch {
        // 무시
      }
    }
  }

  private receive(message: ServerMessage) {
    switch (message.type) {
      case 'joined':
        this.remember({ roomCode: message.roomCode, token: message.token, playerId: message.playerId })
        this.update({ resuming: false, lastError: null })
        return

      case 'state':
        this.update({ state: message.state, clockOffset: message.state.serverTime - this.options.now() })
        return

      case 'events': {
        const lastSeq = this.snapshot.events.at(-1)?.seq ?? 0
        const fresh = message.events.filter((event) => event.seq > lastSeq)
        if (fresh.length === 0) return
        this.update({ events: [...this.snapshot.events, ...fresh].slice(-MAX_EVENTS) })
        return
      }

      case 'action.result': {
        const pending = this.snapshot.pending?.clientActionId === message.clientActionId ? null : this.snapshot.pending
        this.errorCount += 1
        this.update({
          pending,
          lastError:
            message.ok || !message.error
              ? this.snapshot.lastError
              : { error: message.error, requestType: 'action', id: this.errorCount },
        })
        return
      }

      case 'error': {
        this.errorCount += 1
        if (message.error.code === 'SESSION_REPLACED') {
          // 다른 탭이 이 자리를 가져갔다. 서로 번갈아 뺏지 않도록 자동 재접속을 멈춘다.
          this.intentionalClose = true
          this.update({ replaced: true, state: null, events: [], pending: null, resuming: false })
          return
        }
        const resumeFailed = message.requestType === 'room.resume'
        if (resumeFailed) this.forget()
        this.update({
          lastError: { error: message.error, requestType: message.requestType, id: this.errorCount },
          resuming: resumeFailed ? false : this.snapshot.resuming,
          state: resumeFailed ? null : this.snapshot.state,
        })
        return
      }

      case 'pong':
        this.update({ clockOffset: message.serverTime - this.options.now() })
        return
    }
  }
}
