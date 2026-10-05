import { handIndex, positionsOf } from '@banwonpoker/gto'
import type { ActionKind, ChartFile, ChartNode } from '@banwonpoker/gto'
import type { Card } from '../table/model'
import type { HandAction, ReplayHand } from '../replay/model'
import { CHART_STACKS, actionLabel, handCell, nearestStack, situationOf } from './model'
import type { HandCell, Situation } from './model'

/** 복기의 한 결정을 차트에서 찾기 위한 상황 */
export interface Spot {
  handNumber: number
  players: number
  /** 결정하는 사람 */
  playerId: string
  playerName: string
  position: string
  /** 그 결정 전까지 폴드가 아닌 프리플랍 행동(차트 표기) */
  line: SpotStep[]
  /** 실제로 고른 행동 */
  actual: SpotStep
  /** 유효 스택(BB)과 그에 가장 가까운 차트 스택 */
  effectiveBb: number
  stack: number
  /** 169종 핸드 인덱스와 실제 카드 표기 */
  hand: number
  cardsText: string
}

export interface SpotStep {
  position: string
  kind: ActionKind
  toBb: number
}

export type SpotLookup = { ok: true; spot: Spot } | { ok: false; reason: string }
export type Failure = { ok: false; reason: string }

const DECISIONS = new Set<HandAction['kind']>(['check', 'call', 'bet', 'raise', 'fold'])
const suitSymbols = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' } as const
const suitLetters = { spade: 's', heart: 'h', diamond: 'd', club: 'c' } as const
const RANK_ORDER = '23456789TJQKA'
const chartRank = (rank: string) => (rank === '10' ? 'T' : rank)

/** 이 칸이 GTO 분석 버튼을 보여줄 결정인지(누군가의 체크·콜·베팅·레이즈·폴드) */
export function isDecision(action: HandAction | undefined): boolean {
  return action !== undefined && action.playerId !== undefined && DECISIONS.has(action.kind)
}

/** 솔버가 읽는 카드 표기. 예: `Qh`, `Td` */
export const solverCard = (card: Card) => `${chartRank(card.rank)}${suitLetters[card.suit]}`

/** 홀카드 두 장의 169종 인덱스, 화면 표기, 솔버 표기 */
export function holeCards(cards: [Card, Card]) {
  const [a, b] = [...cards].sort((x, y) => RANK_ORDER.indexOf(chartRank(y.rank)) - RANK_ORDER.indexOf(chartRank(x.rank)))
  const [high, low] = [chartRank(a.rank), chartRank(b.rank)]
  const label = high === low ? high + low : high + low + (a.suit === b.suit ? 's' : 'o')
  return {
    hand: handIndex(label),
    cardsText: `${a.rank}${suitSymbols[a.suit]}${b.rank}${suitSymbols[b.suit]}`,
    solverHand: solverCard(a) + solverCard(b),
  }
}

/** 핸드의 블라인드·인원·포지션을 확인한다. */
export function readTable(hand: ReplayHand) {
  const bigBlind = hand.bigBlind
  if (!bigBlind) return { ok: false as const, reason: '이 핸드에는 블라인드 기록이 없어 분석할 수 없습니다.' }
  const players = hand.players.length
  if (players < 2 || players > 6) return { ok: false as const, reason: '2~6인 핸드만 분석할 수 있습니다.' }
  const names = positionsOf(players)
  const positionOf = new Map(hand.players.map((player) => [player.id, player.badge ?? '']))
  if (hand.players.some((player) => !names.includes(positionOf.get(player.id) ?? ''))) {
    return { ok: false as const, reason: '포지션 기록이 없는 핸드입니다.' }
  }
  return { ok: true as const, bigBlind, players, names, positionOf, sb: names[players === 2 ? 0 : players - 2] }
}

type Table = Extract<ReturnType<typeof readTable>, { ok: true }>

/**
 * 프리플랍 행동을 차트 표기로 읽는다. end 칸 앞까지의 폴드가 아닌 행동(line)과 폴드한 사람,
 * end 칸이 프리플랍 결정이면 그 행동(actual)을 돌려준다. anyLimp면 스몰 블라인드가 아닌 림프도 읽는다(멀티웨이 참고 분석).
 */
export function readPreflop(hand: ReplayHand, table: Table, end: number, { anyLimp = false } = {}) {
  let raises = 0
  const toStep = (item: HandAction): SpotStep | { unsupported: string } | null => {
    const position = table.positionOf.get(item.playerId ?? '') ?? ''
    const toBb = (item.to ?? 0) / table.bigBlind
    switch (item.kind) {
      case 'fold':
        return { position, kind: 'fold', toBb }
      case 'check':
        return { position, kind: 'check', toBb }
      case 'call':
        if (raises > 0) return { position, kind: 'call', toBb }
        if (position !== table.sb && !anyLimp) return { unsupported: `${position}의 림프는 차트에 없습니다. 차트는 스몰 블라인드의 림프만 다룹니다.` }
        return { position, kind: 'limp', toBb }
      case 'bet':
      case 'raise':
        raises += 1
        return { position, kind: item.allIn ? 'allin' : 'raise', toBb }
      default:
        return null
    }
  }

  const line: SpotStep[] = []
  const folded = new Set<string>()
  for (const item of hand.actions.slice(0, end)) {
    if (item.street !== 'preflop' || item.kind === 'blind') continue
    if (item.kind === 'fold') {
      folded.add(item.playerId ?? '')
      continue
    }
    if (item.to === undefined) return { ok: false as const, reason: '베팅 금액 기록이 없는 핸드입니다.' }
    const step = toStep(item)
    if (!step) continue
    if ('unsupported' in step) return { ok: false as const, reason: step.unsupported }
    line.push(step)
  }
  const current = hand.actions[end]
  let actual: SpotStep | undefined
  if (current && current.street === 'preflop' && isDecision(current)) {
    const step = toStep(current)
    if (step && 'unsupported' in step) return { ok: false as const, reason: step.unsupported }
    actual = step ?? undefined
  }
  return { ok: true as const, line, folded, actual }
}

/** 복기 핸드의 index 칸 결정을 차트 상황으로 바꾼다. 지원하지 않는 상황이면 이유를 돌려준다. */
export function spotAt(hand: ReplayHand, index: number): SpotLookup {
  const action = hand.actions[index]
  if (!isDecision(action) || !action.playerId) return { ok: false, reason: '참가자의 결정 칸이 아닙니다.' }
  if (action.street !== 'preflop') return { ok: false, reason: '플랍 이후 결정은 포스트플랍 분석으로 봅니다.' }
  const table = readTable(hand)
  if (!table.ok) return table
  const preflop = readPreflop(hand, table, index)
  if (!preflop.ok) return preflop
  const { line, folded, actual } = preflop
  if (!actual) return { ok: false, reason: '참가자의 결정 칸이 아닙니다.' }

  const player = hand.players.find((item) => item.id === action.playerId)
  const myStart = hand.startStacks[action.playerId]
  if (!player || myStart === undefined) return { ok: false, reason: '시작 칩 기록이 없는 핸드입니다.' }
  // 유효 스택: 내 칩과, 아직 폴드하지 않은 상대 중 가장 많은 칩 중 작은 쪽
  const rivals = hand.players
    .filter((item) => item.id !== action.playerId && !folded.has(item.id))
    .map((item) => hand.startStacks[item.id] ?? 0)
  const effectiveBb = Math.min(myStart, Math.max(0, ...rivals)) / table.bigBlind
  const { hand: handClass, cardsText } = holeCards(player.cards)

  return {
    ok: true,
    spot: {
      handNumber: hand.number,
      players: table.players,
      playerId: action.playerId,
      playerName: player.name,
      position: table.positionOf.get(action.playerId) ?? '',
      line,
      actual,
      effectiveBb: Math.round(effectiveBb * 10) / 10,
      stack: nearestStack(CHART_STACKS, effectiveBb),
      hand: handClass,
      cardsText,
    },
  }
}

export interface SpotAnalysis {
  situation: Situation
  node: ChartNode
  cell: HandCell
  labels: string[]
  /** 실제 행동에 해당하는 차트 행동. 차트에 같은 행동이 없으면 -1 */
  actualIndex: number
  /** 가장 자주 고르는 행동 */
  preferredIndex: number
  /** 실제 행동의 EV − 가장 좋은 행동의 EV(BB, 0 이하) */
  evLoss: number | null
  /** 이 핸드가 GTO에서도 이 상황까지 오는지 */
  inRange: boolean
  /** 차트와 실제가 다른 점(스택·사이즈) */
  notes: string[]
}

const raiseLike = (kind: ActionKind) => kind === 'raise' || kind === 'allin'
const compatible = (chart: ActionKind, real: ActionKind) => chart === real || (raiseLike(chart) && raiseLike(real))

const ACTUAL_PREFERENCE: Record<ActionKind, ActionKind[]> = {
  fold: ['fold'],
  check: ['check'],
  limp: ['limp', 'call'],
  call: ['call', 'check'],
  raise: ['raise', 'allin'],
  allin: ['allin', 'raise'],
}

const bb = (value: number) => `${Math.round(value * 10) / 10}BB`
const sizeDiffers = (real: number, chart: number) => Math.abs(real / chart - 1) > 0.15

const NOT_IN_CHART = '차트에 없는 상황입니다. 차트는 팟에 두 명까지 들어온 상황만 다룹니다(오버콜·스퀴즈 뒤 등은 빠져 있음).'

/** 행동하는 포지션과 앞선 라인으로 차트 노드를 찾는다. 금액은 보지 않고 레이즈와 올인은 서로 맞는 것으로 본다. */
export function findNode(chart: ChartFile, position: string, line: SpotStep[]): ChartNode | undefined {
  const actor = chart.positions.indexOf(position)
  let best: { node: ChartNode; score: number } | undefined
  for (const node of chart.nodes) {
    if (node.actor !== actor || node.line.length !== line.length) continue
    let score = 0
    const matches = node.line.every((step, i) => {
      const real = line[i]
      if (chart.positions[step.player] !== real.position || !compatible(step.kind, real.kind)) return false
      if (step.kind === real.kind) score += 1
      return true
    })
    if (matches && (!best || score > best.score)) best = { node, score }
  }
  return best?.node
}

/** 실제 행동에 해당하는 차트 행동 인덱스. 없으면 -1 */
export function actionIndexFor(node: ChartNode, kind: ActionKind): number {
  return ACTUAL_PREFERENCE[kind].map((wanted) => node.actions.findIndex((item) => item.kind === wanted)).find((index) => index >= 0) ?? -1
}

/** 라인 각 단계를 차트가 어떻게 봤는지 다르면 알려준다. */
export function lineNotes(node: ChartNode, line: SpotStep[]): string[] {
  const notes: string[] = []
  node.line.forEach((step, i) => {
    const real = line[i]
    if (step.kind !== real.kind || (raiseLike(step.kind) && sizeDiffers(real.toBb, step.to))) {
      notes.push(
        `${real.position} 실제 ${actionLabel({ kind: real.kind, to: real.toBb }, node.line.slice(0, i))} → 차트 ${actionLabel(step, node.line.slice(0, i))}로 봤습니다.`,
      )
    }
  })
  return notes
}

export const stackNote = (effectiveBb: number, stack: number) => `유효 스택 ${bb(effectiveBb)} → ${stack}BB 차트로 봤습니다.`

/** 차트에서 상황을 찾아 실제 행동과 비교한다. */
export function analyzeSpot(chart: ChartFile, spot: Spot): { ok: true; analysis: SpotAnalysis } | Failure {
  const node = findNode(chart, spot.position, spot.line)
  if (!node) return { ok: false, reason: NOT_IN_CHART }

  const cell = handCell(node, spot.hand)
  const labels = node.actions.map((item) => actionLabel(item, node.line))
  const actualIndex = actionIndexFor(node, spot.actual.kind)
  const preferredIndex = cell.frequencies.reduce((top, value, index, all) => (value > all[top] ? index : top), 0)
  const inRange = cell.reach > 0.0005
  const bestEv = Math.max(...cell.evs)
  const evLoss = inRange && actualIndex >= 0 ? Math.min(0, cell.evs[actualIndex] - bestEv) : null

  const notes: string[] = []
  if (spot.stack !== spot.effectiveBb) notes.push(stackNote(spot.effectiveBb, spot.stack))
  notes.push(...lineNotes(node, spot.line))
  const chosen = node.actions[actualIndex]
  if (chosen && raiseLike(chosen.kind) && (chosen.kind !== spot.actual.kind || sizeDiffers(spot.actual.toBb, chosen.to))) {
    notes.push(`실제 ${actionLabel({ kind: spot.actual.kind, to: spot.actual.toBb }, node.line)} → 차트 ${labels[actualIndex]}로 비교했습니다.`)
  }

  return {
    ok: true,
    analysis: { situation: situationOf(node, chart), node, cell, labels, actualIndex, preferredIndex, evLoss, inRange, notes },
  }
}

export { NOT_IN_CHART }
