import { HAND_COUNT } from './cards'
import { EV_SCALE, REACH_SCALE, STRATEGY_SCALE } from './chart'
import type { ChartFile, ChartNode } from './chart'
import { positionsOf } from './positions'
import { PreflopSolver } from './solver'
import { buildTree } from './tree'
import type { DecisionNode } from './tree'
import type { NodeReport } from './solver'

/** 차트에 싣는 상황이 한 핸드에서 나올 최소 확률 */
export const MIN_OCCURRENCE = 1e-5

/**
 * 차트에 싣는 노드: 많아야 두 사람이 행동한 라인에서 그 두 사람(또는 새로 답하는 사람)이 고르는 곳.
 * 스퀴즈처럼 셋째가 끼어드는 노드와 정리 규칙으로 누군가 자동 폴드된 뒤의 노드는 뺀다.
 */
export function isChartNode(node: DecisionNode): boolean {
  if (node.autoFolded) return false
  const involved = new Set(node.line.map((step) => step.player))
  if (involved.size > 2) return false
  return involved.size < 2 || involved.has(node.player)
}

export function solveChart(players: number, stack: number, iterations: number, equity: Float64Array, compat: Float64Array): ChartFile {
  const tree = buildTree({ players, stack })
  const solver = new PreflopSolver(tree, equity, compat)
  solver.solve(iterations)
  const report = solver.report()

  // 균형에서 거의 나오지 않는 상황(아무도 4벳하지 않는데 4벳에 답하기 등)은 뺀다.
  const occurring = tree.decisions.filter((node) => isChartNode(node) && (report.get(node.id)?.occurs ?? 0) >= MIN_OCCURRENCE)
  const nodes: ChartNode[] = occurring.map((node) => {
    const strategy = solver.averageStrategy(node)
    const { ev, reach } = report.get(node.id) as NodeReport
    const k = node.actions.length
    const reachable = (h: number) => reach[h] > 1e-6
    return {
      actor: node.player,
      line: node.line.map((step) => ({ ...step })),
      actions: node.actions.map((action) => ({ ...action })),
      // 범위 밖 핸드는 의미가 없으므로 0으로 둔다(파일 크기도 줄어든다).
      strategy: Array.from(strategy, (value, index) =>
        reachable(Math.floor(index / k)) ? Math.round(value * STRATEGY_SCALE) : 0,
      ),
      ev: Array.from(ev, (value, index) => (reachable(Math.floor(index / k)) ? Math.round(value * EV_SCALE) : 0)),
      reach: Array.from({ length: HAND_COUNT }, (_, h) => Math.round(reach[h] * REACH_SCALE)),
    }
  })

  return {
    version: 1,
    players,
    stack,
    method: tree.sizing.pushFold ? 'push-fold' : 'approx',
    positions: [...positionsOf(players)],
    iterations: solver.iterations,
    nashConv: Math.round(solver.nashConv() * 10000) / 10000,
    nodes,
  }
}
