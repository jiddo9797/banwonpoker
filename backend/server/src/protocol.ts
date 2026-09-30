/**
 * 브라우저와 게임 서버가 WebSocket으로 주고받는 메시지. 모두 JSON 한 줄이다.
 * 좌석 번호는 0부터 시작한다(화면에는 +1 해서 보여준다).
 */
import type { BlindLevel, EngineEvent, PlayerAction, PlayerView } from '@banwonpoker/engine'

export const PROTOCOL_VERSION = 1

/** 방장이 정하는 방 규칙 */
export interface RoomSettings {
  name: string
  maxPlayers: number
  startingStack: number
  blindMode: 'fixed' | 'increasing'
  levels: BlindLevel[]
  /** 블라인드 인상 간격(분) */
  levelMinutes: number
}

export interface Consent {
  recording: boolean
  reveal: boolean
}

// ── 클라이언트 → 서버 ──────────────────────────────────────────────

export type ClientMessage =
  | { type: 'room.create'; nickname: string; settings: RoomSettings }
  | { type: 'room.join'; roomCode: string; nickname: string }
  /** 연결이 끊긴 뒤 같은 자리로 돌아온다. */
  | { type: 'room.resume'; roomCode: string; token: string }
  | { type: 'seat.take'; seat: number }
  /** 준비 완료에는 녹음·전체 패 공개 동의가 필요하다(D1). 마이크 상태는 서버에 보내지 않는다(D2). */
  | { type: 'ready.set'; ready: boolean; consent: Consent; voiceless: boolean }
  | { type: 'settings.update'; settings: RoomSettings }
  | { type: 'game.start' }
  /** clientActionId가 같은 요청은 한 번만 처리한다(중복 입력 잠금). */
  | { type: 'action'; clientActionId: string; action: PlayerAction }
  | { type: 'session.end' }
  | { type: 'room.leave' }
  | { type: 'ping' }

export type ClientMessageType = ClientMessage['type']

// ── 서버 → 클라이언트 ──────────────────────────────────────────────

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_JOINED'
  | 'ALREADY_JOINED'
  | 'ROOM_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'ROOM_FULL'
  | 'ROOM_ENDED'
  | 'INVALID_NICKNAME'
  | 'NICKNAME_TAKEN'
  | 'INVALID_SETTINGS'
  | 'NOT_HOST'
  | 'WRONG_PHASE'
  | 'SEAT_TAKEN'
  | 'NO_SEAT'
  | 'CONSENT_REQUIRED'
  | 'HOST_NOT_READY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'ACTION_REJECTED'
  /** 다른 탭·기기에서 같은 자리로 들어와 이 연결을 끊었다. */
  | 'SESSION_REPLACED'

export interface ErrorBody {
  code: ErrorCode
  /** 화면에 그대로 보여줄 수 있는 한국어 문구 */
  message: string
}

export type RoomPhase = 'lobby' | 'playing' | 'ended'

/**
 * 다른 참가자에게 공개되는 정보. D2에 따라 마이크·녹음 상태는 넣지 않는다.
 * - lobby: 아직 게임에 들어가지 않음
 * - waiting: 게임 중에 준비를 마쳐 다음 핸드부터 참여
 */
export interface ParticipantSnapshot {
  id: string
  nickname: string
  seat: number | null
  ready: boolean
  connected: boolean
  isHost: boolean
  status: 'lobby' | 'waiting' | 'playing' | 'eliminated' | 'left'
}

export interface SessionResult {
  playerId: string
  nickname: string
  finalStack: number
  delta: number
  place: number
  eliminatedAtHand: number | null
}

export interface SessionSummary {
  endedAt: number
  reason: 'host-ended' | 'last-player'
  handsPlayed: number
  durationMs: number
  results: SessionResult[]
}

export interface RoomSnapshot {
  code: string
  name: string
  hostId: string
  phase: RoomPhase
  settings: RoomSettings
  participants: ParticipantSnapshot[]
  summary: SessionSummary | null
}

export interface GameSnapshot {
  startedAt: number
  /** 이 참가자에게 보이는 테이블. 남의 홀카드는 없다. */
  view: PlayerView
  turn: { playerId: string; deadline: number; durationMs: number } | null
  blinds: { level: BlindLevel; levelIndex: number; nextLevel: BlindLevel | null; nextLevelAt: number | null }
  /** 다음 핸드가 시작되는 시각(핸드 사이 쉬는 시간) */
  nextHandAt: number | null
}

export interface ClientState {
  serverTime: number
  room: RoomSnapshot
  /** 나에게만 보이는 정보 */
  you: { playerId: string; isHost: boolean; seat: number | null; ready: boolean; voiceless: boolean }
  game: GameSnapshot | null
}

/** 엔진 이벤트에 세션 시작부터의 시각을 붙인 것. 녹음·복기 동기화에 쓴다. */
export type TimedEvent = EngineEvent & { sessionTimeMs: number }

export type ServerMessage =
  | { type: 'joined'; roomCode: string; playerId: string; token: string; protocolVersion: number }
  | { type: 'state'; state: ClientState }
  | { type: 'events'; events: TimedEvent[] }
  | { type: 'action.result'; clientActionId: string; ok: boolean; error?: ErrorBody }
  | { type: 'error'; error: ErrorBody; requestType?: string }
  | { type: 'pong'; serverTime: number }

// ── 입력 검증 ─────────────────────────────────────────────────────

type Parsed = { ok: true; message: ClientMessage } | { ok: false; error: ErrorBody }

const bad = (message: string): Parsed => ({ ok: false, error: { code: 'BAD_REQUEST', message } })

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown, max = 64): value is string => typeof value === 'string' && value.length <= max

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

function parseSettings(value: unknown): RoomSettings | undefined {
  if (!isObject(value)) return undefined
  const { name, maxPlayers, startingStack, blindMode, levels, levelMinutes } = value
  if (!isString(name, 100) || !isInt(maxPlayers) || !isInt(startingStack) || !isInt(levelMinutes)) return undefined
  if (blindMode !== 'fixed' && blindMode !== 'increasing') return undefined
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > 50) return undefined
  const parsedLevels: BlindLevel[] = []
  for (const item of levels) {
    if (!isObject(item) || !isInt(item.smallBlind) || !isInt(item.bigBlind)) return undefined
    parsedLevels.push({ smallBlind: item.smallBlind, bigBlind: item.bigBlind })
  }
  return { name, maxPlayers, startingStack, blindMode, levels: parsedLevels, levelMinutes }
}

function parseAction(value: unknown): PlayerAction | undefined {
  if (!isObject(value)) return undefined
  if (value.type === 'fold' || value.type === 'check' || value.type === 'call') return { type: value.type }
  if ((value.type === 'bet' || value.type === 'raise') && isInt(value.amount)) {
    return { type: value.type, amount: value.amount }
  }
  return undefined
}

/** 받은 JSON이 올바른 메시지인지 확인한다. 모르는 필드는 버린다. */
export function parseClientMessage(value: unknown): Parsed {
  if (!isObject(value) || typeof value.type !== 'string') return bad('메시지 형식이 올바르지 않습니다.')

  switch (value.type) {
    case 'room.create': {
      const settings = parseSettings(value.settings)
      if (!isString(value.nickname) || !settings) return bad('닉네임과 방 설정이 필요합니다.')
      return { ok: true, message: { type: 'room.create', nickname: value.nickname, settings } }
    }
    case 'room.join':
      if (!isString(value.roomCode, 16) || !isString(value.nickname)) return bad('방 코드와 닉네임이 필요합니다.')
      return { ok: true, message: { type: 'room.join', roomCode: value.roomCode, nickname: value.nickname } }
    case 'room.resume':
      if (!isString(value.roomCode, 16) || !isString(value.token, 128)) return bad('방 코드와 토큰이 필요합니다.')
      return { ok: true, message: { type: 'room.resume', roomCode: value.roomCode, token: value.token } }
    case 'seat.take':
      if (!isInt(value.seat)) return bad('좌석 번호가 필요합니다.')
      return { ok: true, message: { type: 'seat.take', seat: value.seat } }
    case 'ready.set': {
      const consent = value.consent
      if (
        typeof value.ready !== 'boolean' ||
        typeof value.voiceless !== 'boolean' ||
        !isObject(consent) ||
        typeof consent.recording !== 'boolean' ||
        typeof consent.reveal !== 'boolean'
      ) {
        return bad('준비 상태와 동의 여부가 필요합니다.')
      }
      return {
        ok: true,
        message: {
          type: 'ready.set',
          ready: value.ready,
          voiceless: value.voiceless,
          consent: { recording: consent.recording, reveal: consent.reveal },
        },
      }
    }
    case 'settings.update': {
      const settings = parseSettings(value.settings)
      if (!settings) return bad('방 설정 형식이 올바르지 않습니다.')
      return { ok: true, message: { type: 'settings.update', settings } }
    }
    case 'action': {
      const action = parseAction(value.action)
      if (!isString(value.clientActionId, 64) || value.clientActionId.length === 0 || !action) {
        return bad('액션 형식이 올바르지 않습니다.')
      }
      return { ok: true, message: { type: 'action', clientActionId: value.clientActionId, action } }
    }
    case 'game.start':
    case 'session.end':
    case 'room.leave':
    case 'ping':
      return { ok: true, message: { type: value.type } }
    default:
      return bad('알 수 없는 메시지입니다.')
  }
}
