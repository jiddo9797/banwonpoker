import {
  act,
  blindLevelAt,
  blindLevelIndexAt,
  cancelHand,
  createTable,
  isGameOver,
  leaveTable,
  msUntilNextLevel,
  playerView,
  seatPlayer,
  startHand,
  timeout,
} from '@banwonpoker/engine'
import type { EngineResult, Rng, TableState } from '@banwonpoker/engine'
import type { Clock, TimerHandle } from './clock'
import type {
  ClientMessage,
  ClientState,
  Consent,
  ErrorBody,
  ErrorCode,
  GameSnapshot,
  ParticipantSnapshot,
  RoomPhase,
  RoomSettings,
  RoomSnapshot,
  ServerMessage,
  SessionResult,
  SessionSummary,
  TimedEvent,
} from './protocol'
import { PROTOCOL_VERSION } from './protocol'
import { MIN_PLAYERS, normalizeSettings, scheduleOf, TURN_MS, validateNickname, validateSettings } from './settings'
import type { SessionStore } from './store'

export type Send = (message: ServerMessage) => void

/** 연결을 끊는 함수. 같은 자리에 새 연결이 들어오면 이전 연결을 닫는 데 쓴다. */
export type Close = () => void

export interface RoomOptions {
  turnMs?: number
  /** 핸드가 끝나고 다음 핸드까지 쉬는 시간(쇼다운 결과를 볼 시간) */
  nextHandDelayMs?: number
  /** 접속한 사람이 아무도 없을 때 방을 닫기까지 기다리는 시간 */
  idleCloseMs?: number
  /** 재접속 시 다시 보내 줄 최근 이벤트 수 */
  eventBacklog?: number
}

export interface RoomDeps {
  clock: Clock
  rng: Rng
  /** 참가자 id를 만든다. */
  newId: () => string
  /** 재접속용 비밀 토큰을 만든다. */
  newToken: () => string
  options?: RoomOptions
  /** 방을 닫아도 될 때 부른다(모두 나갔거나 오래 비었을 때). */
  onClose?: (code: string) => void
  /** 세션 기록 저장소. 없으면 기록하지 않는다(테스트 등). */
  store?: SessionStore
  /** 세션 id를 만든다. */
  newSessionId?: () => string
}

interface Participant {
  id: string
  token: string
  nickname: string
  seat: number | null
  ready: boolean
  voiceless: boolean
  consent: Consent
  connected: boolean
  left: boolean
  /** 엔진 테이블에 앉았는지 */
  inGame: boolean
  joinedAt: number
  /** 중복 입력 잠금: 최근에 처리한 clientActionId와 결과 */
  recentActions: Map<string, { ok: boolean; error?: ErrorBody }>
}

type Result<T = void> = { ok: true; value: T } | { ok: false; error: ErrorBody }

const failure = (code: ErrorCode, message: string): { ok: false; error: ErrorBody } => ({
  ok: false,
  error: { code, message },
})

const RECENT_ACTIONS = 20

export class Room {
  readonly code: string
  private settings: RoomSettings
  private hostId: string
  private phase: RoomPhase = 'lobby'
  private readonly participants = new Map<string, Participant>()
  private readonly connections = new Map<string, Send>()
  private readonly closers = new Map<string, Close>()
  private table: TableState | null = null
  private startedAt: number | null = null
  private turn: { playerId: string; turnSeq: number; deadline: number; timer: TimerHandle } | null = null
  private sessionId: string | null = null
  /** 저장소에 적은 차례 중 아직 끝나지 않은 것 */
  private openTurnSeq: number | null = null
  private nextHand: { at: number; timer: TimerHandle } | null = null
  private idleTimer: TimerHandle | null = null
  private summary: SessionSummary | null = null
  private eventLog: TimedEvent[] = []
  private readonly deps: RoomDeps
  private readonly turnMs: number
  private readonly nextHandDelayMs: number
  private readonly idleCloseMs: number
  private readonly eventBacklog: number

  private constructor(code: string, settings: RoomSettings, host: Participant, deps: RoomDeps) {
    this.code = code
    this.settings = settings
    this.hostId = host.id
    this.deps = deps
    this.turnMs = deps.options?.turnMs ?? TURN_MS
    this.nextHandDelayMs = deps.options?.nextHandDelayMs ?? 5_000
    this.idleCloseMs = deps.options?.idleCloseMs ?? 10 * 60_000
    this.eventBacklog = deps.options?.eventBacklog ?? 300
    this.participants.set(host.id, host)
  }

  /** 방을 만들고 방장을 첫 참가자로 넣는다. */
  static create(code: string, nickname: string, settings: RoomSettings, deps: RoomDeps): Result<{ room: Room; playerId: string; token: string }> {
    const nicknameError = validateNickname(nickname)
    if (nicknameError) return failure('INVALID_NICKNAME', nicknameError)
    const settingsError = validateSettings(settings)
    if (settingsError) return failure('INVALID_SETTINGS', settingsError)
    const host = Room.newParticipant(nickname, deps)
    const room = new Room(code, normalizeSettings(settings), host, deps)
    return { ok: true, value: { room, playerId: host.id, token: host.token } }
  }

  private static newParticipant(nickname: string, deps: RoomDeps): Participant {
    return {
      id: deps.newId(),
      token: deps.newToken(),
      nickname: nickname.trim(),
      seat: null,
      ready: false,
      voiceless: false,
      consent: { recording: false, reveal: false },
      connected: false,
      left: false,
      inGame: false,
      joinedAt: deps.clock.now(),
      recentActions: new Map(),
    }
  }

  get isClosed() {
    return this.activeParticipants().length === 0
  }

  get currentPhase() {
    return this.phase
  }

  private activeParticipants() {
    return [...this.participants.values()].filter((participant) => !participant.left)
  }

  // ── 입장·재접속·연결 ─────────────────────────────────────────────

  join(nickname: string): Result<{ playerId: string; token: string }> {
    if (this.phase === 'ended') return failure('ROOM_ENDED', '이미 끝난 세션입니다.')
    const nicknameError = validateNickname(nickname)
    if (nicknameError) return failure('INVALID_NICKNAME', nicknameError)
    const trimmed = nickname.trim()
    const active = this.activeParticipants()
    if (active.some((participant) => participant.nickname === trimmed)) {
      return failure('NICKNAME_TAKEN', '이미 방에 있는 닉네임입니다.')
    }
    if (active.length >= this.settings.maxPlayers) return failure('ROOM_FULL', '방이 가득 찼습니다.')

    const participant = Room.newParticipant(trimmed, this.deps)
    this.participants.set(participant.id, participant)
    this.broadcastState()
    return { ok: true, value: { playerId: participant.id, token: participant.token } }
  }

  /** 토큰으로 참가자를 찾는다. 나간 사람은 돌아올 수 없다. */
  findByToken(token: string) {
    const participant = [...this.participants.values()].find((item) => item.token === token && !item.left)
    return participant?.id
  }

  /** 연결을 참가자에게 붙이고 입장 확인, 현재 상태, 최근 이벤트를 보낸다. 기존 연결은 대체된다. */
  attach(playerId: string, send: Send, close?: Close) {
    const participant = this.participants.get(playerId)
    if (!participant || participant.left) return
    const previous = this.connections.get(playerId)
    if (previous && previous !== send) {
      // 같은 사람이 다른 탭·기기에서 들어왔다. 이전 화면이 멈춘 채 남지 않게 알리고 닫는다.
      previous({
        type: 'error',
        error: { code: 'SESSION_REPLACED', message: '다른 탭이나 기기에서 같은 자리로 들어와 이 화면의 연결을 끊었습니다.' },
      })
      this.closers.get(playerId)?.()
    }
    this.connections.set(playerId, send)
    if (close) this.closers.set(playerId, close)
    else this.closers.delete(playerId)
    participant.connected = true
    if (this.idleTimer) {
      this.deps.clock.clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    send({ type: 'joined', roomCode: this.code, playerId, token: participant.token, protocolVersion: PROTOCOL_VERSION })
    if (this.eventLog.length > 0) send({ type: 'events', events: this.eventLog.slice(-this.eventBacklog) })
    this.broadcastState()
  }

  /** 연결이 끊겼다. 자리는 그대로 두고, 차례였다면 타이머가 끝날 때 자동 처리된다(D4). */
  detach(playerId: string, send: Send) {
    if (this.connections.get(playerId) !== send) return
    this.connections.delete(playerId)
    this.closers.delete(playerId)
    const participant = this.participants.get(playerId)
    if (participant) participant.connected = false
    this.broadcastState()
    if (this.connections.size === 0 && !this.idleTimer) {
      this.idleTimer = this.deps.clock.setTimeout(() => this.close(), this.idleCloseMs)
    }
  }

  // ── 명령 처리 ───────────────────────────────────────────────────

  handle(playerId: string, message: ClientMessage) {
    const participant = this.participants.get(playerId)
    if (!participant || participant.left) return
    const reply = (result: Result<unknown>) => {
      if (!result.ok) this.sendTo(playerId, { type: 'error', error: result.error, requestType: message.type })
    }

    switch (message.type) {
      case 'seat.take':
        return reply(this.takeSeat(participant, message.seat))
      case 'ready.set':
        return reply(this.setReady(participant, message.ready, message.consent, message.voiceless))
      case 'settings.update':
        return reply(this.updateSettings(participant, message.settings))
      case 'game.start':
        return reply(this.startGame(participant))
      case 'action':
        return this.act(participant, message.clientActionId, message.action)
      case 'session.end':
        return reply(this.endSessionBy(participant))
      case 'room.leave':
        return this.leave(participant)
      case 'ping':
        return this.sendTo(playerId, { type: 'pong', serverTime: this.deps.clock.now() })
      default:
        return reply(failure('BAD_REQUEST', '방에 들어온 뒤에는 쓸 수 없는 요청입니다.'))
    }
  }

  private isHost(participant: Participant) {
    return participant.id === this.hostId
  }

  private takeSeat(participant: Participant, seat: number): Result {
    if (this.phase === 'ended') return failure('WRONG_PHASE', '이미 끝난 세션입니다.')
    if (participant.inGame) return failure('WRONG_PHASE', '게임 중에는 자리를 옮길 수 없습니다.')
    if (participant.ready) return failure('WRONG_PHASE', '준비를 취소한 뒤 자리를 옮기세요.')
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.settings.maxPlayers) {
      return failure('SEAT_TAKEN', '없는 좌석입니다.')
    }
    const taken = this.activeParticipants().some((other) => other.id !== participant.id && other.seat === seat)
    const takenInGame = this.table?.players.some((player) => player.status === 'active' && player.seat === seat)
    if (taken || takenInGame) return failure('SEAT_TAKEN', '이미 누군가 앉은 좌석입니다.')
    participant.seat = seat
    this.broadcastState()
    return { ok: true, value: undefined }
  }

  private setReady(participant: Participant, ready: boolean, consent: Consent, voiceless: boolean): Result {
    if (this.phase === 'ended') return failure('WRONG_PHASE', '이미 끝난 세션입니다.')
    if (!ready) {
      if (participant.inGame) return failure('WRONG_PHASE', '게임에 들어간 뒤에는 준비를 취소할 수 없습니다.')
      participant.ready = false
      this.broadcastState()
      return { ok: true, value: undefined }
    }
    if (participant.seat === null) return failure('NO_SEAT', '먼저 좌석을 고르세요.')
    if (!consent.recording || !consent.reveal) {
      return failure('CONSENT_REQUIRED', '녹음과 전체 패 공개에 모두 동의해야 준비할 수 있습니다.')
    }

    participant.ready = true
    participant.consent = { ...consent }
    participant.voiceless = voiceless

    // 게임 중에 준비를 마치면 다음 핸드부터 참여한다.
    if (this.phase === 'playing' && !participant.inGame && this.table) {
      const seated = seatPlayer(this.table, {
        id: participant.id,
        name: participant.nickname,
        seat: participant.seat,
        stack: this.settings.startingStack,
      })
      if (!seated.ok) {
        participant.ready = false
        return failure('SEAT_TAKEN', seated.error.message)
      }
      participant.inGame = true
      this.recordParticipant(participant)
      this.apply(seated)
      return { ok: true, value: undefined }
    }

    this.broadcastState()
    return { ok: true, value: undefined }
  }

  private updateSettings(participant: Participant, settings: RoomSettings): Result {
    if (!this.isHost(participant)) return failure('NOT_HOST', '방장만 설정을 바꿀 수 있습니다.')
    if (this.phase !== 'lobby') return failure('WRONG_PHASE', '게임 중에는 설정을 바꿀 수 없습니다.')
    const error = validateSettings(settings)
    if (error) return failure('INVALID_SETTINGS', error)
    const active = this.activeParticipants()
    if (settings.maxPlayers < active.length) {
      return failure('INVALID_SETTINGS', `지금 ${active.length}명이 있어 ${active.length}명 미만으로 줄일 수 없습니다.`)
    }
    const outside = active.find((other) => other.seat !== null && other.seat >= settings.maxPlayers)
    if (outside) {
      return failure('INVALID_SETTINGS', `${(outside.seat ?? 0) + 1}번 좌석에 ${outside.nickname}이(가) 있어 줄일 수 없습니다.`)
    }
    this.settings = normalizeSettings(settings)
    this.broadcastState()
    return { ok: true, value: undefined }
  }

  private startGame(participant: Participant): Result {
    if (!this.isHost(participant)) return failure('NOT_HOST', '방장만 게임을 시작할 수 있습니다.')
    if (this.phase !== 'lobby') return failure('WRONG_PHASE', '이미 게임이 시작되었습니다.')
    if (!participant.ready) return failure('HOST_NOT_READY', '방장도 준비를 마쳐야 시작할 수 있습니다.')
    const players = this.activeParticipants().filter(
      (other) => other.ready && other.seat !== null && other.connected,
    )
    if (players.length < MIN_PLAYERS) {
      return failure('NOT_ENOUGH_PLAYERS', `준비된 참가자가 ${MIN_PLAYERS}명 이상이어야 합니다.`)
    }

    let table = createTable({ startingStack: this.settings.startingStack, maxSeats: this.settings.maxPlayers })
    for (const player of players) {
      const seated = seatPlayer(table, { id: player.id, name: player.nickname, seat: player.seat as number })
      if (!seated.ok) return failure('SEAT_TAKEN', seated.error.message)
      table = seated.table
      player.inGame = true
    }
    this.table = table
    this.startedAt = this.deps.clock.now()
    this.phase = 'playing'
    if (this.deps.store) {
      this.sessionId = this.deps.newSessionId?.() ?? `s_${this.code}_${this.startedAt}`
      this.deps.store.createSession({
        id: this.sessionId,
        roomCode: this.code,
        name: this.settings.name,
        settings: structuredClone(this.settings),
        startedAt: this.startedAt,
      })
      for (const player of players) this.recordParticipant(player)
    }
    this.startNextHand()
    return { ok: true, value: undefined }
  }

  private act(participant: Participant, clientActionId: string, action: Parameters<typeof act>[2]) {
    const respond = (result: { ok: boolean; error?: ErrorBody }) => {
      participant.recentActions.set(clientActionId, result)
      while (participant.recentActions.size > RECENT_ACTIONS) {
        participant.recentActions.delete(participant.recentActions.keys().next().value as string)
      }
      this.sendTo(participant.id, { type: 'action.result', clientActionId, ...result })
    }

    // 같은 요청이 다시 오면(재전송·연타) 처리하지 않고 같은 결과를 돌려준다.
    const previous = participant.recentActions.get(clientActionId)
    if (previous) {
      this.sendTo(participant.id, { type: 'action.result', clientActionId, ...previous })
      return
    }
    if (this.phase !== 'playing' || !this.table || !participant.inGame) {
      respond({ ok: false, error: { code: 'WRONG_PHASE', message: '지금은 액션을 할 수 없습니다.' } })
      return
    }
    const result = act(this.table, participant.id, action)
    if (!result.ok) {
      respond({ ok: false, error: { code: 'ACTION_REJECTED', message: result.error.message } })
      return
    }
    respond({ ok: true })
    this.apply(result)
  }

  private endSessionBy(participant: Participant): Result {
    if (!this.isHost(participant)) return failure('NOT_HOST', '방장만 세션을 끝낼 수 있습니다.')
    if (this.phase !== 'playing') return failure('WRONG_PHASE', '진행 중인 게임이 없습니다.')
    this.endSession('host-ended')
    return { ok: true, value: undefined }
  }

  private leave(participant: Participant) {
    if (this.phase === 'playing' && this.table && participant.inGame) {
      const player = this.table.players.find((item) => item.id === participant.id)
      if (player?.status === 'active') {
        const result = leaveTable(this.table, participant.id)
        if (result.ok) this.apply(result)
      }
    }
    participant.left = true
    participant.ready = false
    if (this.phase !== 'ended') participant.seat = null
    participant.connected = false
    this.connections.delete(participant.id)
    this.closers.delete(participant.id)

    if (this.isHost(participant)) {
      // 방장이 나가면 가장 먼저 들어온 사람이 방장이 된다.
      const next = this.activeParticipants().sort((a, b) => a.joinedAt - b.joinedAt)[0]
      if (next) this.hostId = next.id
    }
    if (this.isClosed) {
      this.close()
      return
    }
    this.broadcastState()
  }

  // ── 게임 진행 ───────────────────────────────────────────────────

  private startNextHand() {
    this.clearNextHand()
    const table = this.table as TableState
    if (isGameOver(table)) {
      this.endSession('last-player')
      return
    }
    const elapsed = this.deps.clock.now() - (this.startedAt as number)
    const result = startHand(table, { blinds: blindLevelAt(scheduleOf(this.settings), elapsed), rng: this.deps.rng })
    if (!result.ok) {
      this.endSession('last-player')
      return
    }
    this.apply(result)
  }

  /** 엔진 결과를 반영하고 이벤트·타이머·화면을 갱신한다. */
  private apply(result: Extract<EngineResult, { ok: true }>) {
    this.table = result.table
    const now = this.deps.clock.now()
    const events: TimedEvent[] = result.events.map((event) => ({ ...event, sessionTimeMs: now - (this.startedAt ?? now) }))
    this.eventLog.push(...events)
    if (this.eventLog.length > this.eventBacklog * 2) this.eventLog = this.eventLog.slice(-this.eventBacklog)
    this.record(events)

    for (const event of events) {
      if (event.type === 'player-eliminated') {
        const participant = this.participants.get(event.playerId)
        // 탈락한 사람은 관전자가 되고 좌석을 비운다.
        if (participant) participant.seat = null
      }
    }

    const hand = this.table.hand
    if (this.phase === 'playing' && hand && hand.phase !== 'complete' && hand.toAct) {
      if (events.some((event) => event.type === 'turn-started') || this.turn?.playerId !== hand.toAct) {
        this.startTurn(hand.toAct)
      }
    } else {
      this.clearTurn()
      if (this.phase === 'playing' && hand?.phase === 'complete' && !this.nextHand) this.scheduleNextHand()
    }

    this.broadcast({ type: 'events', events })
    this.broadcastState()
  }

  private startTurn(playerId: string) {
    this.clearTurn()
    const deadline = this.deps.clock.now() + this.turnMs
    const timer = this.deps.clock.setTimeout(() => this.onTurnTimeout(playerId), this.turnMs)
    const turnSeq = [...this.eventLog].reverse().find((event) => event.type === 'turn-started' && event.playerId === playerId)?.seq ?? 0
    this.turn = { playerId, turnSeq, deadline, timer }
  }

  private onTurnTimeout(playerId: string) {
    if (!this.turn || this.turn.playerId !== playerId || !this.table) return
    this.turn = null
    const result = timeout(this.table)
    if (result.ok) this.apply(result)
  }

  private clearTurn() {
    if (this.turn) this.deps.clock.clearTimeout(this.turn.timer)
    this.turn = null
  }

  private scheduleNextHand() {
    const at = this.deps.clock.now() + this.nextHandDelayMs
    const timer = this.deps.clock.setTimeout(() => this.startNextHand(), this.nextHandDelayMs)
    this.nextHand = { at, timer }
  }

  private clearNextHand() {
    if (this.nextHand) this.deps.clock.clearTimeout(this.nextHand.timer)
    this.nextHand = null
  }

  private endSession(reason: SessionSummary['reason']) {
    this.clearTurn()
    this.clearNextHand()
    // 진행 중인 핸드는 무효로 하고 낸 칩을 돌려준다.
    if (this.table?.hand && this.table.hand.phase !== 'complete') {
      const cancelled = cancelHand(this.table)
      if (cancelled.ok) {
        this.phase = 'ended'
        this.apply(cancelled)
      }
    }
    this.phase = 'ended'
    this.summary = this.buildSummary(reason)
    if (this.sessionId) this.deps.store?.endSession(this.sessionId, this.summary)
    this.broadcastState()
  }

  private buildSummary(reason: SessionSummary['reason']): SessionSummary {
    const table = this.table as TableState
    const now = this.deps.clock.now()
    const nickname = (id: string) => this.participants.get(id)?.nickname ?? '알 수 없음'
    // 남은 사람은 칩 순서로 순위를 매기고, 탈락한 사람은 탈락 순위를 쓴다.
    const survivors = table.players
      .filter((player) => player.status !== 'eliminated')
      .sort((a, b) => b.stack - a.stack)
    const results: SessionResult[] = [
      ...survivors.map((player, index) => ({ player, place: index + 1 })),
      ...table.players
        .filter((player) => player.status === 'eliminated')
        .map((player) => ({ player, place: player.place ?? table.players.length })),
    ]
      .map(({ player, place }) => ({
        playerId: player.id,
        nickname: nickname(player.id),
        finalStack: player.stack,
        delta: player.stack - this.settings.startingStack,
        place,
        eliminatedAtHand: player.eliminatedAtHand ?? null,
      }))
      .sort((a, b) => a.place - b.place)

    return {
      sessionId: this.sessionId ?? '',
      endedAt: now,
      reason,
      handsPlayed: table.handsPlayed,
      durationMs: now - (this.startedAt ?? now),
      results,
    }
  }

  // ── 기록 ─────────────────────────────────────────────────────

  private recordParticipant(participant: Participant) {
    if (!this.sessionId || !this.deps.store) return
    this.deps.store.addParticipant(
      this.sessionId,
      { playerId: participant.id, nickname: participant.nickname, seat: participant.seat, voiceless: participant.voiceless },
      participant.token,
    )
  }

  /** 이벤트를 저장하고, 핸드 시작·끝에 전체 패와 보드를, 차례 시작·끝에 녹음 대상을 적는다. */
  private record(events: TimedEvent[]) {
    const store = this.deps.store
    const sessionId = this.sessionId
    if (!store || !sessionId || events.length === 0) return
    store.appendEvents(sessionId, events)
    const hand = this.table?.hand

    for (const event of events) {
      if ((event.type === 'hand-started' || event.type === 'hand-ended' || event.type === 'hand-cancelled') && hand) {
        store.saveHand(sessionId, {
          handNumber: hand.number,
          dealerSeat: hand.dealerSeat,
          blinds: hand.blinds,
          holeCards: hand.players.map((player) => ({ playerId: player.id, seat: player.seat, cards: player.holeCards })),
          board: hand.board,
        })
      }
      if (event.type === 'turn-started') {
        this.closeOpenTurn(event.sessionTimeMs)
        store.startTurn(sessionId, {
          turnSeq: event.seq,
          handNumber: hand?.number ?? 0,
          playerId: event.playerId,
          startedMs: event.sessionTimeMs,
          voiceless: this.participants.get(event.playerId)?.voiceless ?? false,
        })
        this.openTurnSeq = event.seq
      }
      if (event.type === 'action' || event.type === 'hand-ended' || event.type === 'hand-cancelled') {
        this.closeOpenTurn(event.sessionTimeMs)
      }
    }
  }

  private closeOpenTurn(at: number) {
    if (this.openTurnSeq === null || !this.sessionId) return
    this.deps.store?.endTurn(this.sessionId, this.openTurnSeq, at)
    this.openTurnSeq = null
  }

  /** 세션 id(게임을 시작한 뒤에만 있다) */
  get currentSessionId() {
    return this.sessionId
  }

  private close() {
    this.clearTurn()
    this.clearNextHand()
    if (this.idleTimer) this.deps.clock.clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.deps.onClose?.(this.code)
  }

  // ── 보내기 ─────────────────────────────────────────────────────

  private sendTo(playerId: string, message: ServerMessage) {
    this.connections.get(playerId)?.(message)
  }

  private broadcast(message: ServerMessage) {
    for (const send of this.connections.values()) send(message)
  }

  private broadcastState() {
    for (const [playerId, send] of this.connections) send({ type: 'state', state: this.stateFor(playerId) })
  }

  private participantStatus(participant: Participant): ParticipantSnapshot['status'] {
    if (participant.left) return 'left'
    const player = this.table?.players.find((item) => item.id === participant.id)
    if (!player) return this.phase === 'playing' && participant.ready ? 'waiting' : 'lobby'
    if (player.status === 'eliminated') return 'eliminated'
    const hand = this.table?.hand
    const inHand = hand?.players.some((item) => item.id === participant.id)
    if (hand && hand.phase !== 'complete' && !inHand) return 'waiting'
    return 'playing'
  }

  private roomSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      sessionId: this.sessionId,
      name: this.settings.name,
      hostId: this.hostId,
      phase: this.phase,
      settings: structuredClone(this.settings),
      participants: [...this.participants.values()]
        .filter((participant) => !participant.left)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((participant) => ({
          id: participant.id,
          nickname: participant.nickname,
          seat: participant.seat,
          ready: participant.ready,
          connected: participant.connected,
          isHost: participant.id === this.hostId,
          status: this.participantStatus(participant),
        })),
      summary: this.summary ? structuredClone(this.summary) : null,
    }
  }

  private gameSnapshot(playerId: string): GameSnapshot | null {
    if (!this.table || this.startedAt === null) return null
    const now = this.deps.clock.now()
    const schedule = scheduleOf(this.settings)
    const elapsed = now - this.startedAt
    const levelIndex = blindLevelIndexAt(schedule, elapsed)
    const untilNext = msUntilNextLevel(schedule, elapsed)
    return {
      startedAt: this.startedAt,
      view: playerView(this.table, playerId),
      turn: this.turn
        ? { playerId: this.turn.playerId, turnSeq: this.turn.turnSeq, deadline: this.turn.deadline, durationMs: this.turnMs }
        : null,
      blinds: {
        level: this.table.hand?.blinds ?? schedule.levels[levelIndex],
        levelIndex,
        nextLevel: untilNext === undefined ? null : schedule.levels[levelIndex + 1],
        nextLevelAt: untilNext === undefined ? null : now + untilNext,
      },
      nextHandAt: this.nextHand?.at ?? null,
    }
  }

  /** 한 참가자에게 보낼 전체 상태. 남의 홀카드와 다른 사람의 음성 선택은 들어가지 않는다. */
  stateFor(playerId: string): ClientState {
    const participant = this.participants.get(playerId) as Participant
    return {
      serverTime: this.deps.clock.now(),
      room: this.roomSnapshot(),
      you: {
        playerId,
        isHost: playerId === this.hostId,
        seat: participant.seat,
        ready: participant.ready,
        voiceless: participant.voiceless,
      },
      game: this.gameSnapshot(playerId),
    }
  }
}
