import type { BlindLevel } from './blinds'
import type { Card } from './cards'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type HandPhase = Street | 'complete'

export type PlayerStatus = 'active' | 'eliminated' | 'left'

/** 테이블에 앉은 참가자 */
export interface Player {
  id: string
  name: string
  /** 0부터 시작하는 좌석 번호. 시계 방향으로 커진다. */
  seat: number
  /** 테이블 앞에 남은 칩(이번 핸드에 낸 칩 제외) */
  stack: number
  status: PlayerStatus
  eliminatedAtHand?: number
  /** 탈락 순위. 1이 우승이다. */
  place?: number
}

/** 핸드에 참여 중인 참가자의 상태 */
export interface HandPlayer {
  id: string
  seat: number
  holeCards: [Card, Card]
  /** 핸드를 시작할 때의 칩 */
  startingStack: number
  /** 이번 스트리트에 낸 칩 */
  streetCommitted: number
  /** 이번 핸드에 낸 전체 칩 */
  totalCommitted: number
  folded: boolean
  allIn: boolean
  /** 마지막 베팅 이후 행동했는지 */
  hasActed: boolean
  /** 레이즈할 수 있는지. 이미 행동한 뒤 모자란 올인 레이즈만 있었다면 콜·폴드만 할 수 있다. */
  mayRaise: boolean
}

export interface ShowdownReveal {
  playerId: string
  cards: [Card, Card]
  handName: string
}

export interface PotAward {
  potIndex: number
  amount: number
  winners: Array<{ playerId: string; amount: number }>
  handName?: string
}

export interface HandState {
  number: number
  dealerSeat: number
  smallBlindSeat: number
  bigBlindSeat: number
  blinds: BlindLevel
  deck: Card[]
  board: Card[]
  phase: HandPhase
  /** 좌석 순서로 정렬 */
  players: HandPlayer[]
  toAct: string | null
  /** 이번 스트리트에서 맞춰야 하는 금액(스트리트 누적) */
  currentBet: number
  /** 다음 레이즈가 최소 얼마나 올려야 하는지 */
  lastRaiseSize: number
  /** 다음 차례를 찾을 기준 좌석 */
  lastActorSeat: number
  showdown: ShowdownReveal[]
  awards: PotAward[]
}

export interface TableState {
  maxSeats: number
  startingStack: number
  players: Player[]
  hand: HandState | null
  handsPlayed: number
  lastDealerSeat: number | null
  /** 이벤트 순번. 녹음·복기 동기화의 기준이 된다. */
  eventSeq: number
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `amount`는 이번 스트리트에 낸 총액(to)이다. */
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }

export interface LegalActions {
  playerId: string
  canFold: boolean
  canCheck: boolean
  /** 콜에 필요한 칩(스택이 모자라면 스택 전부). 체크할 수 있으면 0 */
  callAmount: number
  canBet: boolean
  canRaise: boolean
  /** 베팅·레이즈 총액(to)의 최소값. 스택이 모자라면 올인 금액 */
  minAmount: number
  /** 베팅·레이즈 총액(to)의 최대값 = 올인 */
  maxAmount: number
}

type EventBody =
  | {
      type: 'hand-started'
      handNumber: number
      dealerSeat: number
      smallBlindSeat: number
      bigBlindSeat: number
      blinds: BlindLevel
      playerIds: string[]
    }
  | { type: 'blind-posted'; playerId: string; blind: 'small' | 'big'; amount: number; allIn: boolean }
  | { type: 'hole-cards-dealt'; handNumber: number }
  | { type: 'turn-started'; playerId: string; street: Street }
  | {
      type: 'action'
      playerId: string
      street: Street
      action: ActionType
      /** 이번 행동으로 새로 낸 칩 */
      amount: number
      /** 이번 스트리트 누적 금액 */
      to: number
      allIn: boolean
      timedOut: boolean
    }
  | { type: 'street-dealt'; street: Exclude<Street, 'preflop'>; cards: Card[] }
  | { type: 'showdown'; reveals: ShowdownReveal[] }
  | { type: 'pot-awarded'; award: PotAward }
  | { type: 'player-eliminated'; playerId: string; place: number; handNumber: number }
  | { type: 'hand-ended'; handNumber: number }
  | { type: 'player-joined'; playerId: string; seat: number; joinsNextHand: boolean }
  | { type: 'player-left'; playerId: string }

export type EngineEvent = EventBody & { seq: number }

export type EngineEventBody = EventBody

export type EngineErrorCode =
  | 'NO_HAND'
  | 'HAND_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'AMOUNT_TOO_SMALL'
  | 'AMOUNT_TOO_LARGE'
  | 'SEAT_TAKEN'
  | 'TABLE_FULL'
  | 'DUPLICATE_PLAYER'
  | 'INVALID_BLINDS'
  | 'INVALID_DECK'

export interface EngineError {
  code: EngineErrorCode
  /** 화면에 그대로 보여줄 수 있는 한국어 문구 */
  message: string
}

export type EngineResult = { ok: true; table: TableState; events: EngineEvent[] } | { ok: false; error: EngineError }
