import { HAND_COUNT, REACH_SCALE, STRATEGY_SCALE, handLabel, positionsOf, postflopOrder } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import type { HandAction, ReplayHand } from '../replay/model'
import { CHART_STACKS, nearestStack } from './model'
import { NOT_IN_CHART, actionIndexFor, findNode, holeCards, isDecision, lineNotes, readPreflop, readTable, solverCard, stackNote } from './spot'
import type { Failure, SpotStep } from './spot'

/** 포스트플랍 트리의 베팅 사이즈. 브라우저 메모리(약 0.5GB)에 맞추려고 스트리트마다 한 가지와 올인만 둔다. */
export const POSTFLOP_SIZES = { flopBets: '33%', turnBets: '75%', riverBets: '75%', raises: 'a' } as const

/** 솔버에 넘기는 포스트플랍 행동 하나 또는 새로 깔린 카드 */
export interface PathStep {
  kind: 'check' | 'bet' | 'call' | 'fold' | 'raise' | 'allin' | 'deal'
  amount?: number
  card?: string
}

/** 복기의 포스트플랍 결정 하나 */
export interface PostflopSpot {
  /** 같은 핸드면 한 번 푼 결과를 다시 쓴다. */
  key: string
  handNumber: number
  players: number
  bigBlind: number
  playerId: string
  playerName: string
  position: string
  street: 'flop' | 'turn' | 'river'
  /** 플랍을 본 두 사람 [OOP, IP]의 포지션 */
  seats: [string, string]
  /** 프리플랍 라인(차트 표기)과 레인지를 고를 차트 */
  preflop: SpotStep[]
  effectiveBb: number
  stack: number
  /** 칩 단위 */
  startingPot: number
  effectiveStack: number
  flop: string
  path: PathStep[]
  solverHand: string
  hand: number
  cardsText: string
  /** 실제로 고른 행동 */
  actual: PathStep
}

/** multiway: 세 명 이상이 플랍을 봐서 솔버 대신 참고 분석(multiway.ts)으로 넘긴다. */
export type PostflopLookup = { ok: true; spot: PostflopSpot } | (Failure & { multiway?: true })

const toPathStep = (action: HandAction): PathStep => {
  if (action.kind === 'bet' || action.kind === 'raise') return { kind: action.allIn ? 'allin' : action.kind, amount: action.to ?? 0 }
  if (action.kind === 'call') return { kind: 'call' }
  if (action.kind === 'check') return { kind: 'check' }
  return { kind: 'fold' }
}

/** 복기 핸드의 index 칸(플랍 이후 결정)을 솔버 상황으로 바꾼다. */
export function postflopSpotAt(hand: ReplayHand, index: number): PostflopLookup {
  const action = hand.actions[index]
  if (!isDecision(action) || !action.playerId) return { ok: false, reason: '참가자의 결정 칸이 아닙니다.' }
  if (action.street === 'preflop' || action.street === 'showdown') return { ok: false, reason: '플랍 이후 결정이 아닙니다.' }
  const table = readTable(hand)
  if (!table.ok) return table
  const firstPostflop = hand.actions.findIndex((item) => item.street !== 'preflop' && item.kind !== 'blind')
  // 림프가 섞인 멀티웨이 팟도 참고 분석으로 넘기도록 인원부터 센다.
  const loose = readPreflop(hand, table, firstPostflop, { anyLimp: true })
  const seen = loose.ok ? hand.players.filter((player) => !loose.folded.has(player.id)).length : 0
  if (seen > 2) return { ok: false, multiway: true, reason: `플랍을 ${seen}명이 봤습니다. 포스트플랍 GTO는 두 명이 남은 팟만 분석합니다.` }
  const preflop = readPreflop(hand, table, firstPostflop)
  if (!preflop.ok) return preflop

  const alive = hand.players.filter((player) => !preflop.folded.has(player.id))
  if (alive.length < 2) return { ok: false, reason: '플랍까지 간 사람이 한 명뿐입니다.' }
  if (hand.board.length < 3) return { ok: false, reason: '보드 기록이 없습니다.' }

  const names = positionsOf(table.players)
  const order = (id: string) => postflopOrder(table.players, names.indexOf(table.positionOf.get(id) ?? ''))
  const [oop, ip] = [...alive].sort((a, b) => order(a.id) - order(b.id))

  // 플랍 시작 팟과 유효 스택(칩): 프리플랍에 낸 칩을 모두 더하고, 두 사람의 남은 칩 중 작은 쪽을 쓴다.
  const preflopActions = hand.actions.slice(0, firstPostflop).filter((item) => item.street === 'preflop')
  const spent = (id: string) => preflopActions.reduce((sum, item) => sum + (item.playerId === id ? item.added : 0), 0)
  const startingPot = preflopActions.reduce((sum, item) => sum + item.added, 0)
  const starts = [oop, ip].map((player) => hand.startStacks[player.id])
  if (starts.some((value) => value === undefined)) return { ok: false, reason: '시작 칩 기록이 없는 핸드입니다.' }
  const effectiveStack = Math.min(starts[0] - spent(oop.id), starts[1] - spent(ip.id))
  if (effectiveStack <= 0) return { ok: false, reason: '프리플랍에 올인해 플랍 이후 결정이 없습니다.' }
  const effectiveBb = Math.min(starts[0], starts[1]) / table.bigBlind

  const path: PathStep[] = []
  let street: HandAction['street'] = 'flop'
  for (const item of hand.actions.slice(firstPostflop, index + 1)) {
    if (item.street !== street) {
      const card = hand.board[item.street === 'turn' ? 3 : 4]
      if (!card) return { ok: false, reason: '턴·리버 카드 기록이 없습니다.' }
      // 플랍에서 턴을 건너뛰는 일은 없지만, 리버로 바로 넘어가는 기록이 있으면 턴부터 깐다.
      if (item.street === 'river' && street === 'flop') path.push({ kind: 'deal', card: solverCard(hand.board[3]) })
      path.push({ kind: 'deal', card: solverCard(card) })
      street = item.street
    }
    if (item === action) break
    if (!isDecision(item)) continue
    path.push(toPathStep(item))
  }

  const player = hand.players.find((item) => item.id === action.playerId)
  if (!player) return { ok: false, reason: '결정한 사람을 찾을 수 없습니다.' }
  const cards = holeCards(player.cards)
  const position = table.positionOf.get(action.playerId) ?? ''
  const stack = nearestStack(CHART_STACKS, effectiveBb)

  return {
    ok: true,
    spot: {
      key: `${hand.number}:${hand.board.slice(0, 3).map(solverCard).join('')}`,
      handNumber: hand.number,
      players: table.players,
      bigBlind: table.bigBlind,
      playerId: action.playerId,
      playerName: player.name,
      position,
      street: action.street,
      seats: [table.positionOf.get(oop.id) ?? '', table.positionOf.get(ip.id) ?? ''],
      preflop: preflop.line,
      effectiveBb: Math.round(effectiveBb * 10) / 10,
      stack,
      startingPot,
      effectiveStack,
      flop: hand.board.slice(0, 3).map(solverCard).join(''),
      path,
      solverHand: cards.solverHand,
      hand: cards.hand,
      cardsText: cards.cardsText,
      actual: toPathStep(action),
    },
  }
}

/** 차트 노드의 가중치를 솔버 레인지 문자열로. 예: `AA,AKs:0.62` */
function rangeString(weights: number[]): string {
  return weights
    .map((weight, hand) => ({ weight, hand }))
    .filter((item) => item.weight >= 0.005)
    .map((item) => (item.weight >= 0.995 ? handLabel(item.hand) : `${handLabel(item.hand)}:${item.weight.toFixed(3)}`))
    .join(',')
}

/** 프리플랍 라인에서 그 사람이 마지막으로 고른 행동까지의 레인지(169종 가중치) */
export function rangeOf(chart: ChartFile, line: SpotStep[], position: string): number[] | undefined {
  const last = line.map((step) => step.position).lastIndexOf(position)
  if (last < 0) return undefined
  const node = findNode(chart, position, line.slice(0, last))
  if (!node) return undefined
  const action = actionIndexFor(node, line[last].kind)
  if (action < 0) return undefined
  const k = node.actions.length
  return Array.from({ length: HAND_COUNT }, (_, h) => (node.reach[h] / REACH_SCALE) * (node.strategy[h * k + action] / STRATEGY_SCALE))
}

export interface SolverInput {
  config: {
    oopRange: string
    ipRange: string
    flop: string
    startingPot: number
    effectiveStack: number
    flopBets: string
    turnBets: string
    riverBets: string
    raises: string
    compress: boolean
  }
  /** 결정하는 사람의 이 핸드가 레인지에 있는 정도(0이면 GTO에서는 여기 오지 않음) */
  heroWeight: number
  notes: string[]
}

/** 프리플랍 차트에서 두 사람의 레인지를 만들어 솔버 입력을 꾸린다. */
export function solverInput(chart: ChartFile, spot: PostflopSpot): { ok: true; input: SolverInput } | Failure {
  const [oopSeat, ipSeat] = spot.seats
  const oop = rangeOf(chart, spot.preflop, oopSeat)
  const ip = rangeOf(chart, spot.preflop, ipSeat)
  if (!oop || !ip) return { ok: false, reason: NOT_IN_CHART }
  const oopRange = rangeString(oop)
  const ipRange = rangeString(ip)
  if (!oopRange || !ipRange) return { ok: false, reason: 'GTO 프리플랍에서는 이 라인으로 플랍까지 오는 핸드가 없어 분석할 수 없습니다.' }

  const notes: string[] = []
  if (spot.stack !== spot.effectiveBb) notes.push(stackNote(spot.effectiveBb, spot.stack))
  // 레인지를 만든 노드들의 라인 근사(사이즈 차이 등)
  for (const seat of spot.seats) {
    const last = spot.preflop.map((step) => step.position).lastIndexOf(seat)
    const node = findNode(chart, seat, spot.preflop.slice(0, last))
    if (node) notes.push(...lineNotes(node, spot.preflop.slice(0, last)))
  }
  const heroWeight = (spot.position === oopSeat ? oop : ip)[spot.hand]

  return {
    ok: true,
    input: {
      config: {
        oopRange,
        ipRange,
        flop: spot.flop,
        startingPot: spot.startingPot,
        effectiveStack: spot.effectiveStack,
        ...POSTFLOP_SIZES,
        compress: true,
      },
      heroWeight,
      notes: [...new Set(notes)],
    },
  }
}
