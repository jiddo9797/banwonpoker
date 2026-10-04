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
  /** 목업은 D·SB·BB, 실제 게임은 UTG·HJ·CO·BTN·SB·BB 같은 포지션 이름 */
  badge?: string
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
  /** 이 액션으로 낸 칩 */
  added: number
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
  /** 핸드를 시작할 때 참가자별 칩. 기록이 없는 참가자는 빠져 있다. */
  startStacks: Record<string, number>
  /** 결과 칸에서 참가자별로 받은 칩(나눠 가진 경우 포함) */
  payouts: Record<string, number>
  /** 이 핸드의 빅 블라인드. 있으면 칩을 BB 수로도 보여준다. */
  bigBlind?: number
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
