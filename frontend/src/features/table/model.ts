export const scenarioKeys = [
  'opp',
  'my',
  'pending',
  'fold',
  'allin',
  'showdown',
  'disc',
  'micfail',
  'elim',
] as const

export type ScenarioKey = (typeof scenarioKeys)[number]

export type Suit = 'spade' | 'heart' | 'diamond' | 'club'

export interface Card {
  rank: string
  suit: Suit
}

export type SeatPosition =
  | 'bottom-left'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-right'
  | 'hero'

export type SeatStatus = 'active' | 'folded' | 'all-in' | 'disconnected' | 'eliminated' | 'empty'

export interface Seat {
  id: string
  name: string
  stack: number
  position: SeatPosition
  badge?: 'D' | 'SB' | 'BB'
  bet?: number
  /** 이번 스트리트에 체크했는지. 베팅 금액이 있으면 금액이 먼저다. */
  checked?: boolean
  status: SeatStatus
  isTurn?: boolean
  remainingSeconds?: number
  showdownCards?: [Card, Card]
  handRank?: string
  isWinner?: boolean
  /** 이번 핸드에 참여 중인지. false면 카드를 그리지 않는다(다음 핸드 대기 등). 기본값 true */
  inHand?: boolean
  /** 좌석 아래 상태 칩에 보여줄 문구. 있으면 기본 상태 문구보다 먼저 쓴다. */
  statusNote?: string
}

export interface Pot {
  label: string
  /** 지난 스트리트까지 모인 칩. 이번 스트리트에 낸 칩은 좌석 앞 bet-pill로 따로 보인다. */
  amount: number
}

export type RecordingState = 'hidden' | 'recording' | 'processing' | 'failed'

export interface ActionOption {
  id: 'call' | 'raise' | 'check' | 'fold'
  label: string
  detail: string
  enabled: boolean
  tone: 'neutral' | 'accent' | 'danger'
}

export interface ToastMessage {
  kind: 'info' | 'warning' | 'success'
  message: string
}

export interface TableSnapshot {
  key: ScenarioKey
  label: string
  description: string
  handNumber: number
  gameType: string
  smallBlind: number
  bigBlind: number
  street: string
  board: [Card | null, Card | null, Card | null, Card | null, Card | null]
  pots: Pot[]
  potNote?: string
  seats: Seat[]
  heroId: string
  /** 내 홀카드. 관전 중이거나 다음 핸드를 기다리면 없다. */
  heroCards: [Card, Card] | null
  heroBadge: 'D' | 'SB' | 'BB' | 'none'
  heroStack: number
  heroBet?: number
  /** 이번 스트리트에 내가 체크했는지 */
  heroChecked?: boolean
  heroRemainingSeconds?: number
  /** 이번 핸드에서 내가 이겼는지. 없으면 테이블 문구로 판단한다(목 데이터) */
  heroIsWinner?: boolean
  /** 지금 내 족보 이름(예: `TWO PAIR(2,6)`). 폴드했거나 패가 없으면 없다. */
  heroHandName?: string
  recordingState: RecordingState
  actionHint: string
  actions: ActionOption[]
  callAmount: number
  minRaise: number
  maxRaise: number
  selectedBetAmount: number
  tableMessage?: string
  logs: string[]
  /** 게임 중에 들어와 다음 핸드부터 참여할 참가자 */
  waitingPlayers?: string[]
  /** 실제 게임: 대기 중인 참가자의 id(방장이 내보낼 때 쓴다). waitingPlayers와 순서가 같다. */
  waitingPlayerIds?: string[]
  toast?: ToastMessage
  connection: 'connected' | 'reconnecting' | 'disconnected'
}

export type PanelTab = 'chat' | 'log' | 'participants'

/** 채팅 패널 한 줄 */
export interface ChatLine {
  id: string
  name: string
  text: string
  /** 내가 보낸 메시지 */
  mine: boolean
}

export type DemoPhase = 'idle' | 'pending' | 'settled'

export interface PrototypeState {
  scenarioKey: ScenarioKey
  panelTab: PanelTab
  panelCollapsed: boolean
  selectedBetAmount: number
  demoPhase: DemoPhase
  pendingAction?: ActionOption['id']
  toast?: ToastMessage
  leaveDialogOpen: boolean
  menuOpen: boolean
  endSessionDialogOpen: boolean
  settingsDialogOpen: boolean
}

export type PrototypeAction =
  | { type: 'scenario.changed'; scenarioKey: ScenarioKey; defaultBet: number }
  | { type: 'panel.tabChanged'; tab: PanelTab }
  | { type: 'panel.collapsedChanged' }
  | { type: 'bet.amountChanged'; amount: number }
  | { type: 'action.submitted'; actionId: ActionOption['id'] }
  | { type: 'action.confirmed' }
  | { type: 'invite.copied' }
  | { type: 'toast.dismissed' }
  | { type: 'leave.opened' }
  | { type: 'leave.closed' }
  | { type: 'menu.toggled' }
  | { type: 'menu.closed' }
  | { type: 'endSession.opened' }
  | { type: 'endSession.closed' }
  | { type: 'settings.opened' }
  | { type: 'settings.closed' }

/** 이번 스트리트에 모두가 낸 칩(좌석 앞 bet-pill의 합) */
export function streetBetTotal(snapshot: Pick<TableSnapshot, 'seats' | 'heroBet'>) {
  return snapshot.seats.reduce((sum, seat) => sum + (seat.bet ?? 0), snapshot.heroBet ?? 0)
}

export function isScenarioKey(value: string | null): value is ScenarioKey {
  return scenarioKeys.includes(value as ScenarioKey)
}
