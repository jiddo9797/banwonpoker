import { EV_SCALE, HAND_COUNT, REACH_SCALE, STRATEGY_SCALE, chartFileName, handPrior } from '@banwonpoker/gto'
import type { ActionKind, ChartAction, ChartFile, ChartNode, ChartStep } from '@banwonpoker/gto'

export { CHART_PLAYERS, CHART_STACKS } from '@banwonpoker/gto'

const loaders = import.meta.glob<ChartFile>('./charts/*.json', { import: 'default' })

/** 인원·스택에 맞는 차트 파일을 필요할 때 불러온다. */
export function loadChart(players: number, stack: number): Promise<ChartFile> {
  const loader = loaders[`./charts/${chartFileName(players, stack)}`]
  if (!loader) return Promise.reject(new Error(`${players}인 ${stack}BB 차트가 없습니다.`))
  return loader()
}

/** 색 역할. 콜·체크·림프는 같은 "따라가기" 색을 쓴다(한 노드에 함께 나오지 않는다). */
export type ActionTone = 'fold' | 'passive' | 'raise' | 'allin'

export function actionTone(kind: ActionKind): ActionTone {
  if (kind === 'fold') return 'fold'
  if (kind === 'raise') return 'raise'
  if (kind === 'allin') return 'allin'
  return 'passive'
}

const bb = (amount: number) => `${Number.isInteger(amount) ? amount : amount.toFixed(1).replace(/\.0$/, '')}BB`

/** 라인에서 레이즈(올인 포함)가 몇 번 나왔는지 */
const raiseCount = (line: ChartStep[]) => line.filter((step) => step.kind === 'raise' || step.kind === 'allin').length

function raiseName(level: number, afterLimp: boolean) {
  if (level === 0) return afterLimp ? '아이솔레이션' : '오픈'
  return `${level + 2}벳`
}

/** 라인 앞부분(prefix)을 본 다음 이 행동을 부르는 이름. 예: `3벳 10BB`, `콜`, `올인 100BB` */
export function actionLabel(action: ChartAction, prefix: ChartStep[]): string {
  switch (action.kind) {
    case 'fold':
      return '폴드'
    case 'check':
      return '체크'
    case 'call':
      return '콜'
    case 'limp':
      return '림프'
    case 'allin':
      return `올인 ${bb(action.to)}`
    case 'raise':
      return `${raiseName(raiseCount(prefix), prefix.some((step) => step.kind === 'limp'))} ${bb(action.to)}`
  }
}

export function stepLabel(line: ChartStep[], index: number, positions: readonly string[]): string {
  const step = line[index]
  return `${positions[step.player]} ${actionLabel(step, line.slice(0, index))}`
}

export function describeLine(line: ChartStep[], positions: readonly string[]): string {
  return line.map((_, index) => stepLabel(line, index, positions)).join(' → ')
}

export type SituationGroup = 'open' | 'vs-open' | 'vs-3bet' | 'vs-4bet'

export const SITUATION_GROUP_LABELS: Record<SituationGroup, string> = {
  open: '먼저 들어가기',
  'vs-open': '오픈·림프·올인에 답하기',
  'vs-3bet': '3벳에 답하기',
  'vs-4bet': '4벳 이상에 답하기',
}

export interface Situation {
  /** 인원·스택이 바뀌어도 같은 상황을 찾을 수 있도록 금액을 뺀 키 */
  key: string
  node: ChartNode
  group: SituationGroup
  title: string
  detail: string
}

export function situationKey(node: ChartNode, positions: readonly string[]): string {
  return [positions[node.actor], ...node.line.map((step) => `${positions[step.player]}-${step.kind}`)].join('|')
}

export function situationOf(node: ChartNode, chart: ChartFile): Situation {
  const { positions } = chart
  const levels = raiseCount(node.line)
  const group: SituationGroup = node.line.length === 0 ? 'open' : levels <= 1 ? 'vs-open' : levels === 2 ? 'vs-3bet' : 'vs-4bet'
  let title: string
  if (node.line.length === 0) title = chart.method === 'push-fold' ? '푸시 또는 폴드' : '오픈 (RFI)'
  else title = `vs ${stepLabel(node.line, node.line.length - 1, positions)}`
  const detail = node.line.length === 0 ? '앞사람이 모두 폴드' : describeLine(node.line, positions)
  return { key: situationKey(node, positions), node, group, title, detail }
}

export function situationsFor(chart: ChartFile, position: number): Situation[] {
  return chart.nodes
    .filter((node) => node.actor === position)
    .map((node) => situationOf(node, chart))
    .sort((a, b) => a.node.line.length - b.node.line.length || a.detail.localeCompare(b.detail))
}

export interface HandCell {
  hand: number
  /** 행동별 빈도(0~1) */
  frequencies: number[]
  /** 행동별 기대값(BB) */
  evs: number[]
  /** 범위 가중치(0~1) */
  reach: number
}

export function handCell(node: ChartNode, hand: number): HandCell {
  const k = node.actions.length
  const frequencies: number[] = []
  const evs: number[] = []
  for (let a = 0; a < k; a += 1) {
    frequencies.push(node.strategy[hand * k + a] / STRATEGY_SCALE)
    evs.push(node.ev[hand * k + a] / EV_SCALE)
  }
  return { hand, frequencies, evs, reach: node.reach[hand] / REACH_SCALE }
}

/** 노드 전체에서 각 행동이 차지하는 비율(조합 수 × 범위 가중치로 가중 평균)과 범위가 차지하는 조합 비율 */
export function nodeSummary(node: ChartNode) {
  const k = node.actions.length
  const totals = Array.from({ length: k }, () => 0)
  let mass = 0
  for (let h = 0; h < HAND_COUNT; h += 1) {
    const weight = handPrior[h] * (node.reach[h] / REACH_SCALE)
    if (weight === 0) continue
    mass += weight
    for (let a = 0; a < k; a += 1) totals[a] += (weight * node.strategy[h * k + a]) / STRATEGY_SCALE
  }
  return { frequencies: totals.map((value) => (mass > 0 ? value / mass : 0)), rangeShare: mass }
}

/** 칩 수와 빅 블라인드로 가장 가까운 차트 스택을 고른다. */
export function nearestStack(stacks: readonly number[], effectiveBb: number): number {
  return stacks.reduce((best, stack) => (Math.abs(stack - effectiveBb) < Math.abs(best - effectiveBb) ? stack : best))
}

/** 이 게임에서 자주 쓰는 블라인드 구조(시작 30,000칩) */
export const HOUSE_LEVELS = [
  { small: 50, big: 100 },
  { small: 100, big: 200 },
  { small: 150, big: 300 },
  { small: 250, big: 500 },
  { small: 400, big: 800 },
] as const

export const HOUSE_STARTING_STACK = 30000

export const percent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`

export const signedBb = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}BB`
