import { EV_SCALE, HAND_COUNT, RANK_CHARS, REACH_SCALE, STRATEGY_SCALE, handPrior } from '@banwonpoker/gto'
import type { ActionKind, ChartFile, ChartNode } from '@banwonpoker/gto'
import type { Card } from '../table/model'
import type { HandAction, ReplayHand } from '../replay/model'
import type { NarrowKind, OpponentRequest } from './equity'
import { CHART_STACKS, nearestStack } from './model'
import { rangeOf } from './postflop'
import { actionIndexFor, findNode, holeCards, isDecision, readPreflop, readTable, stackNote } from './spot'
import type { Failure, SpotStep } from './spot'

/**
 * 멀티웨이 팟(세 명 이상이 플랍을 본 핸드)의 참고 분석.
 * GTO 대신 상대 레인지를 근사해 승률을 세고, 팟 오즈와 비교한다.
 */

/** 승률과 필요 승률의 차이가 이 안이면 "비슷함" */
export const CLOSE_MARGIN = 0.03
/** 플랍·턴의 몬테카를로 표본 수(오차 ±0.5% 안쪽) */
export const EQUITY_SAMPLES = 40_000

export interface MultiwayOpponent {
  id: string
  name: string
  position: string
  /** 플랍 이후 이 상대가 한 행동(레인지 좁히기에 쓴다) */
  actions: Array<{ kind: NarrowKind; boardSize: number }>
  /** 이 결정 전에 남은 칩 */
  behind: number
}

export interface MultiwaySpot {
  key: string
  handNumber: number
  players: number
  bigBlind: number
  playerId: string
  playerName: string
  position: string
  street: 'flop' | 'turn' | 'river'
  hand: number
  cardsText: string
  heroCards: [number, number]
  /** 결정 시점까지 깔린 보드 */
  board: number[]
  /** 플랍을 본 인원 */
  flopPlayers: number
  preflop: SpotStep[]
  effectiveBb: number
  stack: number
  /** 결정 직전 팟(칩) */
  pot: number
  /** 콜하려면 더 내야 하는 칩(내 남은 칩까지). 0이면 체크·베팅 결정 */
  toCall: number
  /** 결정 직전 내 남은 칩 */
  behind: number
  /** 실제 행동과 그때 낸 칩, 베팅·레이즈면 이번 스트리트 총액 */
  actual: { kind: HandAction['kind']; added: number; to: number; allIn: boolean }
  /** 베팅·레이즈 전에 이번 스트리트에서 가장 많이 낸 상대의 금액(상대가 콜할 금액 계산용) */
  streetHigh: number
  opponents: MultiwayOpponent[]
}

export type MultiwayLookup = { ok: true; spot: MultiwaySpot } | Failure

const SUIT_INDEX = { spade: 0, heart: 1, diamond: 2, club: 3 } as const
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

/** 카드 정수(rank * 4 + suit) */
export const cardNumber = (card: Card) => RANK_CHARS.indexOf(card.rank === '10' ? 'T' : card.rank) * 4 + SUIT_INDEX[card.suit]
export const cardLabel = (card: number) => `${RANK_CHARS[card >> 2] === 'T' ? '10' : RANK_CHARS[card >> 2]}${SUIT_SYMBOLS[card & 3]}`

const narrowKind = (kind: HandAction['kind']): NarrowKind | null =>
  kind === 'bet' || kind === 'raise' || kind === 'call' || kind === 'check' ? kind : null

const BOARD_SIZE = { flop: 3, turn: 4, river: 5 } as const

/** 복기 핸드의 index 칸이 멀티웨이 팟의 플랍 이후 결정이면 참고 분석 상황을 만든다. */
export function multiwaySpotAt(hand: ReplayHand, index: number): MultiwayLookup {
  const action = hand.actions[index]
  if (!isDecision(action) || !action.playerId) return { ok: false, reason: '참가자의 결정 칸이 아닙니다.' }
  if (action.street === 'preflop' || action.street === 'showdown') return { ok: false, reason: '플랍 이후 결정이 아닙니다.' }
  const table = readTable(hand)
  if (!table.ok) return table
  const firstPostflop = hand.actions.findIndex((item) => item.street !== 'preflop' && item.kind !== 'blind')
  const preflop = readPreflop(hand, table, firstPostflop, { anyLimp: true })
  if (!preflop.ok) return preflop

  const flopPlayers = hand.players.filter((player) => !preflop.folded.has(player.id))
  if (flopPlayers.length < 3) return { ok: false, reason: '두 명이 본 팟은 GTO 솔버로 분석합니다.' }
  const street = action.street
  if (hand.board.length < BOARD_SIZE[street]) return { ok: false, reason: '보드 기록이 없습니다.' }
  const heroId = action.playerId
  if (flopPlayers.some((player) => hand.startStacks[player.id] === undefined)) return { ok: false, reason: '시작 칩 기록이 없는 핸드입니다.' }

  // 결정 직전까지: 낸 칩, 이번 스트리트에 낸 칩, 아직 남은 사람, 상대의 플랍 이후 행동
  const before = hand.actions.slice(0, index)
  const spent = new Map<string, number>()
  const streetSpent = new Map<string, number>()
  const inHand = new Set(flopPlayers.map((player) => player.id))
  const history = new Map<string, MultiwayOpponent['actions']>()
  let pot = 0
  for (const item of before) {
    pot += item.added
    if (!item.playerId) continue
    spent.set(item.playerId, (spent.get(item.playerId) ?? 0) + item.added)
    if (item.street === street) streetSpent.set(item.playerId, (streetSpent.get(item.playerId) ?? 0) + item.added)
    if (item.street === 'preflop' || !isDecision(item)) continue
    if (item.kind === 'fold') {
      inHand.delete(item.playerId)
      continue
    }
    const kind = narrowKind(item.kind)
    if (kind && item.playerId !== heroId) {
      const list = history.get(item.playerId) ?? []
      list.push({ kind, boardSize: BOARD_SIZE[item.street as keyof typeof BOARD_SIZE] })
      history.set(item.playerId, list)
    }
  }
  if (!inHand.has(heroId)) return { ok: false, reason: '이미 폴드한 사람의 칸입니다.' }
  const rivals = flopPlayers.filter((player) => player.id !== heroId && inHand.has(player.id))
  if (rivals.length === 0) return { ok: false, reason: '남은 상대가 없습니다.' }

  const behindOf = (id: string) => (hand.startStacks[id] ?? 0) - (spent.get(id) ?? 0)
  const committed = (id: string) => streetSpent.get(id) ?? 0
  const streetHigh = Math.max(0, ...rivals.map((player) => committed(player.id)))
  const behind = behindOf(heroId)
  const toCall = Math.max(0, Math.min(streetHigh - committed(heroId), behind))

  const hero = hand.players.find((player) => player.id === heroId)
  if (!hero) return { ok: false, reason: '결정한 사람을 찾을 수 없습니다.' }
  const cards = holeCards(hero.cards)
  const heroStart = hand.startStacks[heroId] ?? 0
  const effective = Math.min(heroStart, Math.max(...rivals.map((player) => hand.startStacks[player.id] ?? 0))) / table.bigBlind

  return {
    ok: true,
    spot: {
      key: `${hand.number}:${index}`,
      handNumber: hand.number,
      players: table.players,
      bigBlind: table.bigBlind,
      playerId: heroId,
      playerName: hero.name,
      position: table.positionOf.get(heroId) ?? '',
      street,
      hand: cards.hand,
      cardsText: cards.cardsText,
      heroCards: [cardNumber(hero.cards[0]), cardNumber(hero.cards[1])],
      board: hand.board.slice(0, BOARD_SIZE[street]).map(cardNumber),
      flopPlayers: flopPlayers.length,
      preflop: preflop.line,
      effectiveBb: Math.round(effective * 10) / 10,
      stack: nearestStack(CHART_STACKS, effective),
      pot,
      toCall,
      behind,
      actual: { kind: action.kind, added: action.added, to: action.to ?? committed(heroId) + action.added, allIn: action.allIn ?? false },
      streetHigh,
      opponents: rivals.map((player) => ({
        id: player.id,
        name: player.name,
        position: table.positionOf.get(player.id) ?? '',
        actions: history.get(player.id) ?? [],
        behind: behindOf(player.id),
      })),
    },
  }
}

const raiseLike = (kind: ActionKind) => kind === 'raise' || kind === 'allin'

function nodeRange(node: ChartNode, action: number): number[] {
  const k = node.actions.length
  return Array.from({ length: HAND_COUNT }, (_, h) => (node.reach[h] / REACH_SCALE) * (node.strategy[h * k + action] / STRATEGY_SCALE))
}

/**
 * 오픈 레인지를 강도(가장 좋은 행동의 EV) 순으로 줄 세워 조합 수 기준 [from, to) 구간만 남긴다.
 * 0이 가장 강한 쪽이다.
 */
function openRangeSlice(node: ChartNode, from: number, to: number): number[] {
  const k = node.actions.length
  const open = node.actions.map((action, index) => (action.kind === 'fold' ? -1 : index)).filter((index) => index >= 0)
  const weights = Array.from({ length: HAND_COUNT }, (_, h) => open.reduce((sum, a) => sum + node.strategy[h * k + a] / STRATEGY_SCALE, 0))
  const strength = (h: number) => Math.max(...open.map((a) => node.ev[h * k + a] / EV_SCALE))
  const order = Array.from(weights.keys())
    .filter((h) => weights[h] > 0.0005)
    .sort((x, y) => strength(y) - strength(x))
  const total = order.reduce((sum, h) => sum + weights[h] * handPrior[h], 0)
  const result = Array.from({ length: HAND_COUNT }, () => 0)
  let above = 0
  for (const h of order) {
    const middle = (above + (weights[h] * handPrior[h]) / 2) / total
    above += weights[h] * handPrior[h]
    if (middle >= from && middle < to) result[h] = weights[h]
  }
  return result
}

export interface PreflopRange {
  weights: number[]
  /** 차트에 그대로 있는 라인이 아니어서 근사했는지와 그 방법 */
  approximation?: string
}

/**
 * 한 사람의 프리플랍 레인지. 차트에서 그 라인을 찾고, 없으면 단계적으로 근사한다.
 * 1. 차트에 그대로 있는 라인(오픈, 오픈에 콜, 3벳 등)
 * 2. 앞사람들의 콜·림프를 빼고 레이즈만 남긴 라인(오버콜러 → 같은 오프너에 대한 콜 레인지)
 * 3. 그 포지션 오픈 레인지의 아래쪽 절반(림프·콜), 레이즈면 위쪽 3분의 1. 오픈 노드가 없으면(BB) 모든 핸드
 */
export function preflopRange(chart: ChartFile, line: SpotStep[], position: string): PreflopRange {
  const last = line.map((step) => step.position).lastIndexOf(position)
  const all = () => Array.from({ length: HAND_COUNT }, () => 1)
  if (last < 0) return { weights: all(), approximation: `${position} 레인지는 차트에 없어 모든 핸드로 봤습니다.` }
  const exact = rangeOf(chart, line, position)
  if (exact && exact.some((value) => value > 0.0005)) return { weights: exact }

  const kind = line[last].kind
  const prefix = line.slice(0, last)
  const raises = prefix.filter((step) => raiseLike(step.kind))
  if (raises.length > 0 && raises.length < prefix.length) {
    const node = findNode(chart, position, raises)
    const action = node ? actionIndexFor(node, kind) : -1
    if (node && action >= 0) {
      const weights = nodeRange(node, action)
      if (weights.some((value) => value > 0.0005)) {
        return { weights, approximation: `${position} 레인지는 차트에 없어 앞사람들의 콜을 빼고 같은 레이즈에 대한 레인지로 근사했습니다.` }
      }
    }
  }

  const open = findNode(chart, position, [])
  if (!open || open.actions.every((action) => action.kind === 'fold')) {
    return { weights: all(), approximation: `${position} 레인지는 차트에 없어 모든 핸드로 봤습니다.` }
  }
  if (raiseLike(kind)) {
    return { weights: openRangeSlice(open, 0, 1 / 3), approximation: `${position} 레인지는 차트에 없어 오픈 레인지의 위쪽 3분의 1로 근사했습니다.` }
  }
  return { weights: openRangeSlice(open, 0.5, 1), approximation: `${position} 레인지는 차트에 없어 오픈 레인지의 아래쪽 절반으로 근사했습니다.` }
}

/** 남은 상대들의 승률 계산 입력과 근사 안내 */
export function opponentRequests(chart: ChartFile, spot: MultiwaySpot): { opponents: OpponentRequest[]; notes: string[] } {
  const notes: string[] = []
  if (spot.stack !== spot.effectiveBb) notes.push(stackNote(spot.effectiveBb, spot.stack))
  const opponents = spot.opponents.map((opponent) => {
    const range = preflopRange(chart, spot.preflop, opponent.position)
    if (range.approximation) notes.push(range.approximation)
    return { weights: range.weights, actions: opponent.actions }
  })
  return { opponents, notes }
}

/** 콜에 필요한 승률: 콜 금액 ÷ (지금 팟 + 콜 금액) */
export const requiredEquity = (call: number, pot: number) => call / (pot + call)

/** 콜의 단순 기대값(칩): 승률 × (지금 팟 + 내 콜) − 콜 금액 */
export const callEv = (equity: number, pot: number, call: number) => equity * (pot + call) - call

export type CallVerdict = 'call' | 'fold' | 'close'

export function judgeCall(equity: number, required: number): CallVerdict {
  if (equity >= required + CLOSE_MARGIN) return 'call'
  if (equity <= required - CLOSE_MARGIN) return 'fold'
  return 'close'
}

/** 콜하면 더 칠 칩이 없는지(내가 올인이 되거나 남은 상대가 모두 올인) */
export function isAllInCall(spot: MultiwaySpot): boolean {
  return spot.toCall > 0 && (spot.toCall >= spot.behind || spot.opponents.every((opponent) => opponent.behind <= 0))
}

/**
 * 내가 베팅·레이즈했을 때 상대가 콜하려면 필요한 승률. 이번 스트리트에서 가장 많이 낸 상대 기준.
 * 체크·콜·폴드면 null
 */
export function opponentRequired(spot: MultiwaySpot): number | null {
  if (spot.actual.kind !== 'bet' && spot.actual.kind !== 'raise') return null
  const call = spot.actual.to - spot.streetHigh
  if (call <= 0) return null
  return requiredEquity(call, spot.pot + spot.actual.added)
}
