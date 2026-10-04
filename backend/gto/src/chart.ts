import type { ActionKind } from './tree'

/** 차트를 미리 계산해 두는 인원과 스택(BB). 15BB 이하는 푸시/폴드다. */
export const CHART_PLAYERS = [2, 3, 4, 5, 6] as const
export const CHART_STACKS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 300] as const

export type ChartMethod = 'push-fold' | 'approx'

export interface ChartAction {
  kind: ActionKind
  /** 이 행동 뒤 낸 총액(BB) */
  to: number
}

export interface ChartStep extends ChartAction {
  /** 포지션 인덱스(프리플랍 행동 순서) */
  player: number
}

export interface ChartNode {
  /** 행동하는 사람의 포지션 인덱스 */
  actor: number
  /** 여기까지의 폴드가 아닌 행동. 나머지 사람은 모두 폴드했다. */
  line: ChartStep[]
  actions: ChartAction[]
  /** 핸드 169 × 행동 수, 빈도 × 1000 */
  strategy: number[]
  /** 핸드 169 × 행동 수, 이 시점부터의 기대 칩 증감(BB) × 100 */
  ev: number[]
  /** 핸드 169, 이 핸드로 이 시점까지 올 확률 × 1000(범위 가중치) */
  reach: number[]
}

export interface ChartFile {
  version: 1
  players: number
  stack: number
  method: ChartMethod
  positions: string[]
  iterations: number
  /** 각자 최선 대응으로 바꿨을 때 얻는 이득의 합(BB/핸드). 작을수록 균형에 가깝다. */
  nashConv: number
  nodes: ChartNode[]
}

export const STRATEGY_SCALE = 1000
export const EV_SCALE = 100
export const REACH_SCALE = 1000

export const chartFileName = (players: number, stack: number) => `${players}p-${stack}bb.json`
