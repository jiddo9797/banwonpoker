import { describe, expect, it } from 'vitest'
import equityFile from '../tables/equity.json'
import { isChartNode, solveChart } from './build'
import { HAND_COUNT, TOTAL_COMBOS, comboCount, compatibilityMatrix, handIndex, handLabel, handPrior } from './cards'
import { positionsFromButton, postflopOrder } from './positions'
import { PreflopSolver } from './solver'
import { decodeEquity } from './tables'
import type { EquityFile } from './tables'
import { buildTree } from './tree'
import type { DecisionNode } from './tree'

const equity = decodeEquity(equityFile as EquityFile)
const compat = compatibilityMatrix()
const eq = (a: string, b: string) => equity[handIndex(a) * HAND_COUNT + handIndex(b)]

/** 노드에서 각 행동이 차지하는 비율(조합 수 × 범위 가중치) */
function frequencies(solver: PreflopSolver, node: DecisionNode, reach: Float64Array) {
  const strategy = solver.averageStrategy(node)
  const k = node.actions.length
  const totals = Array.from({ length: k }, () => 0)
  let mass = 0
  for (let h = 0; h < HAND_COUNT; h += 1) {
    const weight = handPrior[h] * reach[h]
    mass += weight
    for (let a = 0; a < k; a += 1) totals[a] += weight * strategy[h * k + a]
  }
  return totals.map((value) => value / mass)
}

describe('핸드 169종', () => {
  it('표 칸과 이름이 서로 바뀌고 조합 수 합이 1326이다', () => {
    for (let hand = 0; hand < HAND_COUNT; hand += 1) expect(handIndex(handLabel(hand))).toBe(hand)
    expect(handLabel(0)).toBe('AA')
    expect(handLabel(1)).toBe('AKs')
    expect(handLabel(13)).toBe('AKo')
    expect(Array.from({ length: HAND_COUNT }, (_, hand) => comboCount(hand)).reduce((a, b) => a + b)).toBe(TOTAL_COMBOS)
  })

  it('카드 겹침을 반영한 조건부 확률은 줄마다 합이 1이다', () => {
    for (const hand of [0, 1, 13, 168]) {
      let sum = 0
      for (let o = 0; o < HAND_COUNT; o += 1) sum += compat[hand * HAND_COUNT + o]
      expect(sum).toBeCloseTo(1, 10)
    }
    // AA를 들면 상대 AA는 한 가지 조합뿐이다.
    expect(compat[handIndex('AA') * HAND_COUNT + handIndex('AA')]).toBeCloseTo(1 / 1225, 10)
  })
})

describe('포지션', () => {
  it('딜러부터 시계 방향 순서로 이름을 준다', () => {
    expect(positionsFromButton(2)).toEqual(['BTN', 'BB'])
    expect(positionsFromButton(3)).toEqual(['BTN', 'SB', 'BB'])
    expect(positionsFromButton(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'])
  })
})

describe('승률표', () => {
  it('알려진 프리플랍 올인 승률과 맞다', () => {
    expect(eq('AA', 'KK')).toBeCloseTo(0.819, 2)
    expect(eq('AKs', 'QQ')).toBeCloseTo(0.46, 1)
    expect(eq('72o', 'AA')).toBeCloseTo(0.12, 1)
    expect(eq('KK', 'AA') + eq('AA', 'KK')).toBeCloseTo(1, 10)
  })
})

describe('프리플랍 트리', () => {
  it('어느 끝에서도 팟을 다투는 사람은 두 명 이하이고 낸 금액이 스택을 넘지 않는다', () => {
    for (const players of [2, 3, 6]) {
      for (const stack of [10, 25, 100]) {
        const tree = buildTree({ players, stack })
        for (const node of tree.terminals) {
          expect(node.pot).toBeCloseTo(node.contrib.reduce((a, b) => a + b), 10)
          for (const value of node.contrib) expect(value).toBeLessThanOrEqual(stack)
          if (node.contestants) {
            const [oop, ip] = node.contestants
            expect(postflopOrder(players, oop)).toBeLessThan(postflopOrder(players, ip))
            expect(node.contrib[oop]).toBeCloseTo(node.contrib[ip], 10)
          }
        }
      }
    }
  })

  it('15BB 이하는 푸시/폴드만 남는다', () => {
    const tree = buildTree({ players: 6, stack: 15 })
    for (const node of tree.decisions) {
      for (const action of node.actions) expect(['fold', 'allin', 'call']).toContain(action.kind)
    }
  })

  it('블라인드 대 블라인드에서만 림프할 수 있다', () => {
    const tree = buildTree({ players: 6, stack: 100 })
    const limps = tree.decisions.filter((node) => node.actions.some((action) => action.kind === 'limp'))
    expect(limps.map((node) => node.player)).toEqual([4])
  })
})

describe('CFR 솔버', () => {
  it('2인 10BB 푸시/폴드는 알려진 내시 균형(SB 약 58% 푸시, BB 약 37% 콜)에 수렴한다', () => {
    const tree = buildTree({ players: 2, stack: 10 })
    const solver = new PreflopSolver(tree, equity, compat)
    solver.solve(400)
    const report = solver.report()
    const [push, call] = tree.decisions
    const pushFreq = frequencies(solver, push, report.get(push.id)!.reach)
    const callFreq = frequencies(solver, call, report.get(call.id)!.reach)
    expect(pushFreq[1]).toBeGreaterThan(0.56)
    expect(pushFreq[1]).toBeLessThan(0.6)
    expect(callFreq[1]).toBeGreaterThan(0.35)
    expect(callFreq[1]).toBeLessThan(0.39)
    expect(solver.nashConv()).toBeLessThan(0.001)
    // AA는 늘 푸시하고 72o는 콜하지 않는다.
    const k = push.actions.length
    expect(solver.averageStrategy(push)[handIndex('AA') * k + 1]).toBeGreaterThan(0.99)
    expect(solver.averageStrategy(call)[handIndex('72o') * k + 1]).toBeLessThan(0.01)
  })

  it('6인 100BB에서 뒤 포지션일수록 더 넓게 오픈하고 균형 오차가 작다', () => {
    const chart = solveChart(6, 100, 250, equity, compat)
    expect(chart.method).toBe('approx')
    expect(chart.nashConv).toBeLessThan(0.03)
    const openRate = (position: string) => {
      const node = chart.nodes.find((item) => item.line.length === 0 && chart.positions[item.actor] === position)!
      const k = node.actions.length
      let mass = 0
      let open = 0
      for (let h = 0; h < HAND_COUNT; h += 1) {
        mass += handPrior[h]
        open += handPrior[h] * (1 - node.strategy[h * k] / 1000)
      }
      return open / mass
    }
    const rates = ['UTG', 'HJ', 'CO', 'BTN'].map(openRate)
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeGreaterThan(rates[i - 1])
    expect(rates[0]).toBeGreaterThan(0.1)
    expect(rates[0]).toBeLessThan(0.25)
    expect(rates[3]).toBeGreaterThan(0.3)
    expect(rates[3]).toBeLessThan(0.6)
  }, 60_000)

  it('차트에는 스퀴즈처럼 셋째가 끼어드는 노드를 싣지 않는다', () => {
    const tree = buildTree({ players: 6, stack: 100 })
    const squeeze = tree.decisions.find((node) => new Set(node.line.map((step) => step.player)).size === 2 && !node.line.some((step) => step.player === node.player))
    expect(squeeze).toBeDefined()
    expect(isChartNode(squeeze!)).toBe(false)
    expect(isChartNode(tree.root as DecisionNode)).toBe(true)
  })
})
