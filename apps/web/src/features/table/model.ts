export const scenarioKeys = [
  'opp',
  'my',
  'pending',
  'fold',
  'allin',
  'showdown',
  'disc',
  'micfail',
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

export type SeatStatus = 'active' | 'folded' | 'all-in' | 'disconnected' | 'empty'

export interface Seat {
  id: string
  name: string
  stack: number
  position: SeatPosition
  badge?: 'D' | 'SB' | 'BB'
  bet?: number
  status: SeatStatus
  isTurn?: boolean
  remainingSeconds?: number
  showdownCards?: [Card, Card]
  handRank?: string
  isWinner?: boolean
}

export interface Pot {
  label: string
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
  heroCards: [Card, Card]
  heroStack: number
  heroBet?: number
  heroRemainingSeconds?: number
  recordingState: RecordingState
  actionHint: string
  actions: ActionOption[]
  callAmount: number
  minRaise: number
  maxRaise: number
  selectedBetAmount: number
  tableMessage?: string
  logs: string[]
  toast?: ToastMessage
  connection: 'connected' | 'reconnecting' | 'disconnected'
}

export type PanelTab = 'log' | 'participants'

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

export function isScenarioKey(value: string | null): value is ScenarioKey {
  return scenarioKeys.includes(value as ScenarioKey)
}
