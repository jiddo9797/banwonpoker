import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BlindLevel, Card } from '@banwonpoker/engine'
import type { RoomSettings, SessionSummary, TimedEvent } from './protocol'

/** 음성 조각 하나의 최대 크기. 3초 Opus 조각은 보통 수십 KB다. */
export const MAX_CHUNK_BYTES = 1024 * 1024
export const MAX_CHUNKS_PER_TURN = 400

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export interface StoredParticipant {
  playerId: string
  nickname: string
  seat: number | null
  voiceless: boolean
}

export interface StoredHand {
  handNumber: number
  dealerSeat: number
  blinds: BlindLevel
  /** 전체 패 공개용. 게임 중에는 누구에게도 보내지 않는다. */
  /** startStack: 핸드를 시작할 때의 칩. 이 필드를 넣기 전에 저장된 핸드에는 없다. */
  holeCards: Array<{ playerId: string; seat: number; cards: [Card, Card]; startStack?: number }>
  board: Card[]
}

export type TurnStatus = 'voice' | 'silent' | 'failed' | 'missing' | 'voiceless'

export interface StoredTurn {
  turnSeq: number
  handNumber: number
  playerId: string
  startedMs: number
  endedMs: number | null
  voiceless: boolean
  receivedChunks: number
  /** 녹음한 쪽이 알려 준 결과. 알리기 전에 연결이 끊기면 없다. */
  report: { chunks: number; durationMs: number; silent: boolean; failed: boolean; audioStartMs: number | null } | null
}

export interface SessionRecord {
  id: string
  roomCode: string
  name: string
  settings: RoomSettings
  startedAt: number
  endedAt: number | null
  summary: SessionSummary | null
}

/**
 * 세션 기록 저장소. SQLite(Node 내장)에 기록을, 폴더에 음성 조각을 둔다.
 * 게임 중에는 쓰기만 하고, 음성과 전체 패는 세션이 끝난 뒤 참가자에게만 읽힌다(서버가 확인).
 */
export class SessionStore {
  private readonly db: DatabaseSync
  private readonly audioDir: string | null

  /**
   * @param dataDir 데이터 폴더. 없으면 메모리 DB를 쓰고 음성은 DB에 넣는다(테스트용).
   */
  constructor(dataDir?: string) {
    if (dataDir) {
      mkdirSync(join(dataDir, 'audio'), { recursive: true })
      this.db = new DatabaseSync(join(dataDir, 'banwonpoker.db'))
      this.audioDir = join(dataDir, 'audio')
    } else {
      this.db = new DatabaseSync(':memory:')
      this.audioDir = null
    }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        name TEXT NOT NULL,
        settings TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        summary TEXT
      );
      CREATE TABLE IF NOT EXISTS participants (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        player_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        seat INTEGER,
        voiceless INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY (session_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS hands (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        hand_number INTEGER NOT NULL,
        dealer_seat INTEGER NOT NULL,
        blinds TEXT NOT NULL,
        hole_cards TEXT NOT NULL,
        board TEXT NOT NULL,
        PRIMARY KEY (session_id, hand_number)
      );
      CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
      );
      CREATE TABLE IF NOT EXISTS turns (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        turn_seq INTEGER NOT NULL,
        hand_number INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        started_ms INTEGER NOT NULL,
        ended_ms INTEGER,
        voiceless INTEGER NOT NULL,
        report TEXT,
        PRIMARY KEY (session_id, turn_seq)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        session_id TEXT NOT NULL,
        turn_seq INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        bytes INTEGER NOT NULL,
        data BLOB,
        PRIMARY KEY (session_id, turn_seq, chunk_index)
      );
    `)
  }

  close() {
    this.db.close()
  }

  // ── 쓰기 ─────────────────────────────────────────────────────

  createSession(session: Omit<SessionRecord, 'endedAt' | 'summary'>) {
    this.db
      .prepare('INSERT INTO sessions (id, room_code, name, settings, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(session.id, session.roomCode, session.name, JSON.stringify(session.settings), session.startedAt)
  }

  /** 게임에 들어온 참가자. 게임 중에 들어온 사람도 들어올 때 부른다. */
  addParticipant(sessionId: string, participant: StoredParticipant, token: string) {
    this.db
      .prepare(
        `INSERT INTO participants (session_id, player_id, nickname, seat, voiceless, token_hash) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (session_id, player_id) DO UPDATE SET seat = excluded.seat, voiceless = excluded.voiceless`,
      )
      .run(sessionId, participant.playerId, participant.nickname, participant.seat, participant.voiceless ? 1 : 0, hashToken(token))
  }

  saveHand(sessionId: string, hand: StoredHand) {
    this.db
      .prepare(
        `INSERT INTO hands (session_id, hand_number, dealer_seat, blinds, hole_cards, board) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (session_id, hand_number) DO UPDATE SET board = excluded.board`,
      )
      .run(sessionId, hand.handNumber, hand.dealerSeat, JSON.stringify(hand.blinds), JSON.stringify(hand.holeCards), JSON.stringify(hand.board))
  }

  appendEvents(sessionId: string, events: TimedEvent[]) {
    const insert = this.db.prepare('INSERT OR IGNORE INTO events (session_id, seq, body) VALUES (?, ?, ?)')
    for (const event of events) insert.run(sessionId, event.seq, JSON.stringify(event))
  }

  startTurn(sessionId: string, turn: { turnSeq: number; handNumber: number; playerId: string; startedMs: number; voiceless: boolean }) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO turns (session_id, turn_seq, hand_number, player_id, started_ms, voiceless) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(sessionId, turn.turnSeq, turn.handNumber, turn.playerId, turn.startedMs, turn.voiceless ? 1 : 0)
  }

  endTurn(sessionId: string, turnSeq: number, endedMs: number) {
    this.db.prepare('UPDATE turns SET ended_ms = ? WHERE session_id = ? AND turn_seq = ? AND ended_ms IS NULL').run(endedMs, sessionId, turnSeq)
  }

  /** 음성 조각을 저장한다. 같은 번호가 다시 오면(재전송) 무시하고 false를 돌려준다. */
  saveChunk(sessionId: string, turnSeq: number, index: number, data: Uint8Array) {
    const exists = this.db
      .prepare('SELECT 1 FROM chunks WHERE session_id = ? AND turn_seq = ? AND chunk_index = ?')
      .get(sessionId, turnSeq, index)
    if (exists) return false
    if (this.audioDir) {
      const dir = join(this.audioDir, sessionId, String(turnSeq))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${index}.webm`), data)
    }
    this.db
      .prepare('INSERT INTO chunks (session_id, turn_seq, chunk_index, bytes, data) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, turnSeq, index, data.byteLength, this.audioDir ? null : data)
    return true
  }

  reportTurn(sessionId: string, turnSeq: number, report: NonNullable<StoredTurn['report']>) {
    this.db.prepare('UPDATE turns SET report = ? WHERE session_id = ? AND turn_seq = ?').run(JSON.stringify(report), sessionId, turnSeq)
  }

  endSession(sessionId: string, summary: SessionSummary) {
    this.db.prepare('UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?').run(summary.endedAt, JSON.stringify(summary), sessionId)
  }

  // ── 읽기 ─────────────────────────────────────────────────────

  getSession(sessionId: string): SessionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
      | { id: string; room_code: string; name: string; settings: string; started_at: number; ended_at: number | null; summary: string | null }
      | undefined
    if (!row) return undefined
    return {
      id: row.id,
      roomCode: row.room_code,
      name: row.name,
      settings: JSON.parse(row.settings) as RoomSettings,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: row.summary ? (JSON.parse(row.summary) as SessionSummary) : null,
    }
  }

  /** 토큰으로 이 세션의 참가자를 찾는다. */
  participantByToken(sessionId: string, token: string): StoredParticipant | undefined {
    const row = this.db
      .prepare('SELECT player_id, nickname, seat, voiceless FROM participants WHERE session_id = ? AND token_hash = ?')
      .get(sessionId, hashToken(token)) as { player_id: string; nickname: string; seat: number | null; voiceless: number } | undefined
    return row ? { playerId: row.player_id, nickname: row.nickname, seat: row.seat, voiceless: row.voiceless === 1 } : undefined
  }

  participants(sessionId: string): StoredParticipant[] {
    return (
      this.db.prepare('SELECT player_id, nickname, seat, voiceless FROM participants WHERE session_id = ?').all(sessionId) as Array<{
        player_id: string
        nickname: string
        seat: number | null
        voiceless: number
      }>
    ).map((row) => ({ playerId: row.player_id, nickname: row.nickname, seat: row.seat, voiceless: row.voiceless === 1 }))
  }

  hands(sessionId: string): StoredHand[] {
    return (
      this.db.prepare('SELECT * FROM hands WHERE session_id = ? ORDER BY hand_number').all(sessionId) as Array<{
        hand_number: number
        dealer_seat: number
        blinds: string
        hole_cards: string
        board: string
      }>
    ).map((row) => ({
      handNumber: row.hand_number,
      dealerSeat: row.dealer_seat,
      blinds: JSON.parse(row.blinds) as BlindLevel,
      holeCards: JSON.parse(row.hole_cards) as StoredHand['holeCards'],
      board: JSON.parse(row.board) as Card[],
    }))
  }

  events(sessionId: string): TimedEvent[] {
    return (this.db.prepare('SELECT body FROM events WHERE session_id = ? ORDER BY seq').all(sessionId) as Array<{ body: string }>).map(
      (row) => JSON.parse(row.body) as TimedEvent,
    )
  }

  turn(sessionId: string, turnSeq: number): StoredTurn | undefined {
    return this.turns(sessionId).find((turn) => turn.turnSeq === turnSeq)
  }

  turns(sessionId: string): StoredTurn[] {
    return (
      this.db
        .prepare(
          `SELECT t.*, (SELECT COUNT(*) FROM chunks c WHERE c.session_id = t.session_id AND c.turn_seq = t.turn_seq) AS received
           FROM turns t WHERE t.session_id = ? ORDER BY t.turn_seq`,
        )
        .all(sessionId) as Array<{
        turn_seq: number
        hand_number: number
        player_id: string
        started_ms: number
        ended_ms: number | null
        voiceless: number
        report: string | null
        received: number
      }>
    ).map((row) => ({
      turnSeq: row.turn_seq,
      handNumber: row.hand_number,
      playerId: row.player_id,
      startedMs: row.started_ms,
      endedMs: row.ended_ms,
      voiceless: row.voiceless === 1,
      receivedChunks: row.received,
      report: row.report ? (JSON.parse(row.report) as StoredTurn['report']) : null,
    }))
  }

  /** 한 차례의 음성 조각을 순서대로 이어 붙인다. 조각이 이어진 순서대로 있어야 재생된다. */
  turnAudio(sessionId: string, turnSeq: number): Uint8Array | undefined {
    const rows = this.db
      .prepare('SELECT chunk_index, data FROM chunks WHERE session_id = ? AND turn_seq = ? ORDER BY chunk_index')
      .all(sessionId, turnSeq) as Array<{ chunk_index: number; data: Uint8Array | null }>
    if (rows.length === 0) return undefined
    const parts: Uint8Array[] = []
    for (const [position, row] of rows.entries()) {
      // 중간 조각이 빠지면 그 뒤는 이어 붙여도 재생되지 않으므로 앞부분만 쓴다.
      if (row.chunk_index !== position) break
      if (row.data) parts.push(row.data)
      else if (this.audioDir) {
        const file = join(this.audioDir, sessionId, String(turnSeq), `${row.chunk_index}.webm`)
        if (!existsSync(file)) break
        parts.push(readFileSync(file))
      }
    }
    if (parts.length === 0) return undefined
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
    const joined = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      joined.set(part, offset)
      offset += part.byteLength
    }
    return joined
  }
}
