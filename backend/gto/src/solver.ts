import { HAND_COUNT, handPrior } from './cards'
import { flopShareMatrices, showdownMatrix } from './realization'
import type { DecisionNode, GameTree, TerminalNode, TreeNode } from './tree'

/**
 * 벡터형 CFR(Discounted CFR)로 프리플랍 트리를 푼다.
 *
 * 프리플랍에는 공개 카드가 없으므로 트리의 각 결정 노드에서 169개 핸드의 전략을 한꺼번에 다룬다.
 * 다투는 두 사람 사이에는 카드 겹침을 반영한 조건부 확률을 쓰고,
 * 이미 폴드한 사람의 핸드는 겹침을 무시하고 범위 크기만 곱한다.
 */

const H = HAND_COUNT
const ALPHA = 1.5
const BETA = 0
const GAMMA = 2

interface NodeData {
  regret: Float64Array
  strategySum: Float64Array
}

interface TerminalData {
  /** 다투는 두 사람 각각의 몫 행렬(내 핸드 줄, 상대 핸드 칸) */
  share: [Float64Array, Float64Array] | null
}

export interface NodeReport {
  /** 행동별 기대값 `[h * 행동 수 + a]` */
  ev: Float64Array
  /** 행동하는 사람이 핸드별로 여기까지 올 확률 */
  reach: Float64Array
  /** 한 핸드에서 이 상황이 나올 확률(카드 겹침 무시) */
  occurs: number
}

export interface SolveProgress {
  iteration: number
  /** 각자 최선 대응으로 바꿨을 때 얻는 이득의 합(BB). 0에 가까울수록 균형에 가깝다. */
  nashConv?: number
}

const dot = (a: Float64Array, b: Float64Array) => {
  let sum = 0
  for (let i = 0; i < H; i += 1) sum += a[i] * b[i]
  return sum
}

const isZero = (vector: Float64Array) => {
  for (let i = 0; i < H; i += 1) if (vector[i] > 0) return false
  return true
}

export class PreflopSolver {
  readonly tree: GameTree
  private readonly compat: Float64Array
  private readonly nodeData = new Map<number, NodeData>()
  private readonly terminalData = new Map<number, TerminalData>()
  iterations = 0

  constructor(tree: GameTree, equity: Float64Array, compat: Float64Array) {
    this.tree = tree
    this.compat = compat
    for (const node of tree.decisions) {
      const size = H * node.actions.length
      this.nodeData.set(node.id, { regret: new Float64Array(size), strategySum: new Float64Array(size) })
    }
    const flopCache = new Map<number, { oop: Float64Array; ip: Float64Array }>()
    let showdown: Float64Array | null = null
    for (const node of tree.terminals) {
      if (!node.contestants) {
        this.terminalData.set(node.id, { share: null })
        continue
      }
      if (node.allIn) {
        showdown ??= showdownMatrix(equity, compat)
        this.terminalData.set(node.id, { share: [showdown, showdown] })
        continue
      }
      const key = Math.round(node.spr * 4) / 4
      let matrices = flopCache.get(key)
      if (!matrices) {
        matrices = flopShareMatrices(equity, compat, key)
        flopCache.set(key, matrices)
      }
      this.terminalData.set(node.id, { share: [matrices.oop, matrices.ip] })
    }
  }

  /** 반복 횟수만큼 푼다. 한 반복은 플레이어마다 한 번씩 트리를 돈다. */
  solve(iterations: number, onProgress?: (progress: SolveProgress) => void, reportEvery = 0) {
    for (let i = 0; i < iterations; i += 1) {
      this.iterations += 1
      for (let p = 0; p < this.tree.players; p += 1) this.walk(this.tree.root, p, this.initialReach(), 'train')
      if (onProgress && reportEvery > 0 && this.iterations % reportEvery === 0) {
        onProgress({ iteration: this.iterations, nashConv: this.nashConv() })
      }
    }
  }

  /** 노드의 평균 전략. `[h * 행동 수 + a]` */
  averageStrategy(node: DecisionNode): Float64Array {
    const data = this.nodeData.get(node.id) as NodeData
    const k = node.actions.length
    const result = new Float64Array(H * k)
    for (let h = 0; h < H; h += 1) {
      let total = 0
      for (let a = 0; a < k; a += 1) total += data.strategySum[h * k + a]
      for (let a = 0; a < k; a += 1) result[h * k + a] = total > 0 ? data.strategySum[h * k + a] / total : 1 / k
    }
    return result
  }

  /** 모든 플레이어가 평균 전략을 쓸 때 각자의 기대 수익(BB)과 최선 대응 수익의 차이 합 */
  nashConv(): number {
    let total = 0
    for (let p = 0; p < this.tree.players; p += 1) {
      const value = dot(handPrior, this.walk(this.tree.root, p, this.initialReach(), 'value'))
      const best = dot(handPrior, this.walk(this.tree.root, p, this.initialReach(), 'best'))
      total += best - value
    }
    return total
  }

  /**
   * 평균 전략을 따라 트리를 돌며 결정 노드마다 행동별 기대값(그 시점부터의 칩 증감, BB)과
   * 행동하는 사람의 범위 가중치(그 핸드로 여기까지 올 확률)를 모은다.
   */
  report(): Map<number, NodeReport> {
    const result = new Map<number, NodeReport>()
    for (let p = 0; p < this.tree.players; p += 1) {
      this.walk(this.tree.root, p, this.initialReach(), 'value', (node, reach, actionValues) => {
        const k = node.actions.length
        const norm = this.opponentMass(node.player, reach)
        const ev = new Float64Array(H * k)
        for (let h = 0; h < H; h += 1) {
          for (let a = 0; a < k; a += 1) {
            ev[h * k + a] = norm[h] > 0 ? actionValues[a][h] / norm[h] + node.contrib[node.player] : 0
          }
        }
        let occurs = 1
        for (const r of reach) occurs *= dot(handPrior, r)
        result.set(node.id, { ev, reach: Float64Array.from(reach[node.player]), occurs })
      })
    }
    return result
  }

  private initialReach(): Float64Array[] {
    return Array.from({ length: this.tree.players }, () => new Float64Array(H).fill(1))
  }

  /** 다른 사람들이 각자의 범위로 여기까지 올 확률(내 핸드별) */
  private opponentMass(player: number, reach: Float64Array[]): Float64Array {
    const result = new Float64Array(H)
    if (this.tree.players === 2) {
      const other = reach[1 - player]
      for (let h = 0; h < H; h += 1) {
        let sum = 0
        const row = h * H
        for (let o = 0; o < H; o += 1) sum += this.compat[row + o] * other[o]
        result[h] = sum
      }
      return result
    }
    let product = 1
    for (let q = 0; q < this.tree.players; q += 1) if (q !== player) product *= dot(handPrior, reach[q])
    return result.fill(product)
  }

  private currentStrategy(node: DecisionNode): Float64Array {
    const { regret } = this.nodeData.get(node.id) as NodeData
    const k = node.actions.length
    const strategy = new Float64Array(H * k)
    for (let h = 0; h < H; h += 1) {
      let positive = 0
      for (let a = 0; a < k; a += 1) positive += Math.max(0, regret[h * k + a])
      for (let a = 0; a < k; a += 1) {
        strategy[h * k + a] = positive > 0 ? Math.max(0, regret[h * k + a]) / positive : 1 / k
      }
    }
    return strategy
  }

  private terminalValue(node: TerminalNode, p: number, reach: Float64Array[]): Float64Array {
    const result = new Float64Array(H)
    const { players } = this.tree
    const { share } = this.terminalData.get(node.id) as TerminalData

    if (!node.contestants || !node.contestants.includes(p)) {
      // 모두 폴드했거나 내가 이미 폴드한 경우: 내 핸드와 상관없는 칩 증감
      const payoff = node.winner === p ? node.pot - node.contrib[p] : -node.contrib[p]
      const mass = this.opponentMass(p, reach)
      for (let h = 0; h < H; h += 1) result[h] = payoff * mass[h]
      return result
    }

    const [oop, ip] = node.contestants
    const opponent = p === oop ? ip : oop
    const matrix = (share as [Float64Array, Float64Array])[p === oop ? 0 : 1]
    const other = reach[opponent]
    if (isZero(other)) return result
    let dead = 1
    if (players > 2) for (let q = 0; q < players; q += 1) if (q !== p && q !== opponent) dead *= dot(handPrior, reach[q])
    if (dead === 0) return result
    const pot = node.pot
    const invested = node.contrib[p]
    const compat = this.compat
    for (let h = 0; h < H; h += 1) {
      const row = h * H
      let won = 0
      let mass = 0
      for (let o = 0; o < H; o += 1) {
        const r = other[o]
        if (r === 0) continue
        won += matrix[row + o] * r
        mass += compat[row + o] * r
      }
      result[h] = dead * (pot * won - invested * mass)
    }
    return result
  }

  private walk(
    node: TreeNode,
    p: number,
    reach: Float64Array[],
    mode: 'train' | 'value' | 'best',
    visit?: (node: DecisionNode, reach: Float64Array[], actionValues: Float64Array[]) => void,
  ): Float64Array {
    if (node.type === 'terminal') return this.terminalValue(node, p, reach)

    const k = node.actions.length
    const q = node.player
    const strategy = mode === 'train' ? this.currentStrategy(node) : this.averageStrategy(node)
    const value = new Float64Array(H)

    if (q !== p) {
      for (let a = 0; a < k; a += 1) {
        const next = new Float64Array(H)
        for (let h = 0; h < H; h += 1) next[h] = reach[q][h] * strategy[h * k + a]
        if (isZero(next)) continue
        const childReach = reach.slice()
        childReach[q] = next
        const child = this.walk(node.children[a], p, childReach, mode, visit)
        for (let h = 0; h < H; h += 1) value[h] += child[h]
      }
      return value
    }

    const actionValues: Float64Array[] = []
    for (let a = 0; a < k; a += 1) {
      const childReach = reach.slice()
      const next = new Float64Array(H)
      for (let h = 0; h < H; h += 1) next[h] = reach[p][h] * strategy[h * k + a]
      childReach[p] = next
      actionValues.push(this.walk(node.children[a], p, childReach, mode, visit))
    }
    for (let h = 0; h < H; h += 1) {
      if (mode === 'best') {
        let best = -Infinity
        for (let a = 0; a < k; a += 1) best = Math.max(best, actionValues[a][h])
        value[h] = best
      } else {
        for (let a = 0; a < k; a += 1) value[h] += strategy[h * k + a] * actionValues[a][h]
      }
    }
    visit?.(node, reach, actionValues)

    if (mode === 'train') {
      const data = this.nodeData.get(node.id) as NodeData
      const t = this.iterations
      const positiveDiscount = t ** ALPHA / (t ** ALPHA + 1)
      const negativeDiscount = t ** BETA / (t ** BETA + 1)
      const sumDiscount = (t / (t + 1)) ** GAMMA
      for (let h = 0; h < H; h += 1) {
        const r = reach[p][h]
        for (let a = 0; a < k; a += 1) {
          const index = h * k + a
          const previous = data.regret[index]
          data.regret[index] = previous * (previous > 0 ? positiveDiscount : negativeDiscount) + actionValues[a][h] - value[h]
          data.strategySum[index] = data.strategySum[index] * sumDiscount + r * strategy[index]
        }
      }
    }
    return value
  }
}
