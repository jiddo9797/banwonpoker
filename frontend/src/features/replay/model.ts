import type { Card, SeatPosition } from '../table/model'

/**
 * 차례 하나의 음성 트랙 상태.
 * - voice: 음성이 저장됨
 * - silent: 기록은 됐지만 발언이 없음
 * - failed: 녹음이나 업로드가 실패함
 * - missing: 기록이 서버에 도착하지 않음(누락)
 * - voiceless: `음성 없이 참여`로 기록하지 않음
 * - none: 블라인드·결과처럼 음성이 없는 칸
 */
export type AudioStatus = 'voice' | 'silent' | 'failed' | 'missing' | 'voiceless' | 'none'

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface ReplayPlayer {
  id: string
  name: string
  position: SeatPosition
  cards: [Card, Card]
  badge?: 'D' | 'SB' | 'BB'
}

export interface HandAction {
  id: string
  street: Street
  /** 결과 칸처럼 특정 참가자의 액션이 아니면 비워 둔다. */
  playerId?: string
  label: string
  kind: 'blind' | 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'result'
  /** 이 액션까지 반영된 팟 */
  pot: number
  thinkSeconds?: number
  audio: { status: AudioStatus; seconds?: number }
  /** 실제 게임: 이 차례의 음성을 받을 번호 */
  turnSeq?: number
}

export interface ReplayHand {
  number: number
  /** 실제로 펼쳐진 보드(최대 5장). 프리플랍에서 끝났으면 비어 있다. */
  board: Card[]
  players: ReplayPlayer[]
  actions: HandAction[]
  result: string
}

export interface SessionResult {
  playerId: string
  name: string
  finalStack: number
  delta: number
  /** 칩을 모두 잃어 탈락한 핸드 */
  eliminatedAtHand?: number
}

export interface SessionSummary {
  roomName: string
  durationMinutes: number
  handCount: number
  startingStack: number
  results: SessionResult[]
  /** 내 음성 기록 통계. 다른 참가자의 통계는 요약에 두지 않는다. */
  selfRecording: {
    turns: number
    saved: number
    silent: number
    failed: number
    missing: number
  }
  hands: Array<{ number: number; winner: string; delta: number; note: string }>
}

export type ExportStatus = 'closed' | 'options' | 'generating' | 'done' | 'failed'

export type ExportScope = 'hand' | 'session'

export type PlaybackSpeed = 1 | 1.5 | 2

export interface MixerChannel {
  volume: number
  muted: boolean
}

export interface ReplayState {
  /** 복기할 핸드들(번호 순) */
  hands: ReplayHand[]
  handNumber: number
  index: number
  playing: boolean
  speed: PlaybackSpeed
  mixer: Record<string, MixerChannel>
  exportStatus: ExportStatus
  exportProgress: number
  exportScope: ExportScope
}

export type ReplayAction =
  | { type: 'hand.changed'; handNumber: number }
  | { type: 'action.selected'; index: number }
  | { type: 'playback.toggled' }
  | { type: 'playback.stepped'; delta: number }
  | { type: 'playback.ticked' }
  | { type: 'speed.changed'; speed: PlaybackSpeed }
  | { type: 'mixer.volumeChanged'; playerId: string; volume: number }
  | { type: 'mixer.muteToggled'; playerId: string }
  | { type: 'export.opened' }
  | { type: 'export.scopeChanged'; scope: ExportScope }
  | { type: 'export.started' }
  | { type: 'export.progressed'; progress: number }
  | { type: 'export.completed' }
  | { type: 'export.failed' }
  | { type: 'export.closed' }
