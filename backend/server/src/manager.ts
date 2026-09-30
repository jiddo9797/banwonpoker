import { randomBytes, randomInt } from 'node:crypto'
import { cryptoRng } from '@banwonpoker/engine'
import type { Rng } from '@banwonpoker/engine'
import type { Clock } from './clock'
import type { ErrorBody, RoomSettings } from './protocol'
import { Room } from './room'
import type { RoomOptions } from './room'
import type { SessionStore } from './store'

/** 헷갈리는 글자(0·O, 1·I·L)를 뺀 방 코드 글자 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export interface ManagerDeps {
  clock: Clock
  /** 방마다 쓸 셔플 난수. 기본은 암호학적 난수 */
  rngFactory?: () => Rng
  newCode?: () => string
  newId?: () => string
  newToken?: () => string
  roomOptions?: RoomOptions
  store?: SessionStore
  newSessionId?: () => string
}

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

/** 방 코드는 대소문자·공백·하이픈을 무시한다. */
export function normalizeRoomCode(code: string) {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly deps: ManagerDeps

  constructor(deps: ManagerDeps) {
    this.deps = deps
  }

  get size() {
    return this.rooms.size
  }

  get(code: string) {
    return this.rooms.get(normalizeRoomCode(code))
  }

  create(nickname: string, settings: RoomSettings): { ok: true; room: Room; playerId: string; token: string } | { ok: false; error: ErrorBody } {
    const newCode = this.deps.newCode ?? randomCode
    let code = newCode()
    for (let attempt = 0; this.rooms.has(code) && attempt < 20; attempt += 1) code = newCode()
    if (this.rooms.has(code)) return { ok: false, error: { code: 'BAD_REQUEST', message: '방을 만들지 못했습니다. 다시 시도하세요.' } }

    const created = Room.create(code, nickname, settings, {
      clock: this.deps.clock,
      rng: (this.deps.rngFactory ?? cryptoRng)(),
      newId: this.deps.newId ?? (() => `p_${randomBytes(6).toString('hex')}`),
      newToken: this.deps.newToken ?? (() => randomBytes(24).toString('hex')),
      options: this.deps.roomOptions,
      onClose: (closed) => this.rooms.delete(closed),
      store: this.deps.store,
      newSessionId: this.deps.newSessionId ?? (() => `s_${randomBytes(9).toString('base64url')}`),
    })
    if (!created.ok) return created
    this.rooms.set(code, created.value.room)
    return { ok: true, room: created.value.room, playerId: created.value.playerId, token: created.value.token }
  }
}
