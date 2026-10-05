import { HAND_COUNT, evaluate7, evaluateCards, handCombos, seededRandom } from '@banwonpoker/gto'

/**
 * 멀티웨이 참고 분석의 계산 부분. 상대 레인지를 플랍 이후 행동으로 좁히고, 내 승률을 센다.
 * 카드는 `rank * 4 + suit` 정수(rank 0=2 … 12=A)로 다룬다. 워커(equity.worker.ts)에서 돌린다.
 */

export type NarrowKind = 'bet' | 'raise' | 'call' | 'check'

/**
 * 상대 행동마다 남기는 범위. 레인지를 그 시점 보드에서의 강도 순으로 줄 세웠을 때
 * [위에서부터 시작, 끝, 남기는 비율]. 0이 가장 강한 쪽이다.
 */
export const NARROWING: Record<NarrowKind, Array<[number, number, number]>> = {
  // 위쪽 55% + 아래쪽 10%(블러프 몫)
  bet: [
    [0, 0.55, 1],
    [0.9, 1, 1],
  ],
  // 위쪽 30% + 아래쪽 5%
  raise: [
    [0, 0.3, 1],
    [0.95, 1, 1],
  ],
  // 가장 약한 30% 제외
  call: [[0, 0.7, 1]],
  // 가장 강한 10%는 절반만 남긴다(나머지는 베팅했을 것).
  check: [
    [0, 0.1, 0.5],
    [0.1, 1, 1],
  ],
}

export interface OpponentRequest {
  /** 프리플랍 레인지(169종 가중치) */
  weights: number[]
  /** 플랍 이후 이 상대가 한 행동과 그때 깔려 있던 보드 장수 */
  actions: Array<{ kind: NarrowKind; boardSize: number }>
}

export interface EquityRequest {
  hero: [number, number]
  /** 결정 시점까지 깔린 보드(0~5장) */
  board: number[]
  opponents: OpponentRequest[]
  /** 몬테카를로 표본 수(리버에서 상대가 두 명 이하면 정확히 센다) */
  samples: number
  seed: number
}

export interface EquityResult {
  /** 남은 상대 전원을 이길 확률(비기면 나눠 갖는 몫 포함) */
  equity: number
  /** 상대별 일대일 승률 */
  versus: number[]
  exact: boolean
  samples: number
  /** 좁힌 뒤 상대별로 남은 조합 수(가중치 합) */
  combos: number[]
}

/** 가중치가 붙은 두 장 조합 목록 */
export interface ComboRange {
  first: Int8Array
  second: Int8Array
  weights: Float64Array
}

/** 169종 가중치를 죽은 카드와 겹치지 않는 조합으로 펼친다. */
export function expandRange(weights: number[], dead: number[]): ComboRange {
  const first: number[] = []
  const second: number[] = []
  const values: number[] = []
  for (let hand = 0; hand < HAND_COUNT; hand += 1) {
    const weight = weights[hand]
    if (!(weight > 0.0005)) continue
    for (const [a, b] of handCombos(hand)) {
      if (dead.includes(a) || dead.includes(b)) continue
      first.push(a)
      second.push(b)
      values.push(weight)
    }
  }
  return { first: Int8Array.from(first), second: Int8Array.from(second), weights: Float64Array.from(values) }
}

const STRENGTH_SAMPLES = 120

/**
 * 조합마다 이 보드에서의 강도. 리버는 족보 그대로, 플랍·턴은 무작위 핸드 하나를 상대로 한 승률이다
 * (지금 족보에 드로우가 자연스럽게 더해진다). 줄 세우는 데만 쓰므로 표본은 적게 쓴다.
 */
export function strengths(range: ComboRange, board: number[], seed: number): Float64Array {
  const result = new Float64Array(range.weights.length)
  if (board.length === 5) {
    const [b0, b1, b2, b3, b4] = board
    for (let i = 0; i < result.length; i += 1) result[i] = evaluate7(range.first[i], range.second[i], b0, b1, b2, b3, b4)
    return result
  }
  const random = seededRandom(seed)
  const deck = new Int32Array(52)
  const cards = new Int32Array(7)
  const theirs = new Int32Array(7)
  const missing = 5 - board.length
  for (let i = 0; i < result.length; i += 1) {
    const a = range.first[i]
    const b = range.second[i]
    let size = 0
    for (let card = 0; card < 52; card += 1) if (card !== a && card !== b && !board.includes(card)) deck[size++] = card
    let score = 0
    for (let s = 0; s < STRENGTH_SAMPLES; s += 1) {
      // 앞쪽 (모자란 보드 + 상대 두 장)만 섞는다.
      for (let k = 0; k < missing + 2; k += 1) {
        const j = k + Math.floor(random() * (size - k))
        const swap = deck[k]
        deck[k] = deck[j]
        deck[j] = swap
      }
      for (let k = 0; k < board.length; k += 1) cards[k] = theirs[k] = board[k]
      for (let k = 0; k < missing; k += 1) cards[board.length + k] = theirs[board.length + k] = deck[k]
      cards[5] = a
      cards[6] = b
      theirs[5] = deck[missing]
      theirs[6] = deck[missing + 1]
      const mine = evaluateCards(cards)
      const other = evaluateCards(theirs)
      score += mine > other ? 1 : mine === other ? 0.5 : 0
    }
    result[i] = score / STRENGTH_SAMPLES
  }
  return result
}

/** 강도 순으로 줄 세워 규칙에 맞는 범위만 남긴다. 남는 게 없으면 그대로 둔다. */
export function narrowRange(range: ComboRange, strength: Float64Array, kind: NarrowKind): ComboRange {
  const order = Array.from(range.weights.keys()).sort((x, y) => strength[y] - strength[x])
  const total = range.weights.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return range
  const weights = new Float64Array(range.weights.length)
  let above = 0
  for (const i of order) {
    const middle = (above + range.weights[i] / 2) / total
    above += range.weights[i]
    const band = NARROWING[kind].find(([from, to]) => middle >= from && middle < to)
    weights[i] = range.weights[i] * (band ? band[2] : 0)
  }
  if (!weights.some((value) => value > 0)) return range
  return { ...range, weights }
}

/** 상대 한 명의 프리플랍 레인지를 펼치고 플랍 이후 행동마다 좁힌다. */
export function opponentRange(opponent: OpponentRequest, hero: [number, number], board: number[], seed: number): ComboRange {
  let range = expandRange(opponent.weights, [...hero, ...board])
  opponent.actions.forEach((action, index) => {
    const seen = board.slice(0, action.boardSize)
    range = narrowRange(range, strengths(range, seen, seed + index * 7919), action.kind)
  })
  return range
}

/** 가중치 누적합. 무작위로 조합을 고를 때 쓴다. */
function cumulative(weights: Float64Array): Float64Array {
  const sums = new Float64Array(weights.length)
  let total = 0
  for (let i = 0; i < weights.length; i += 1) {
    total += weights[i]
    sums[i] = total
  }
  return sums
}

function pick(sums: Float64Array, random: () => number): number {
  const target = random() * sums[sums.length - 1]
  let low = 0
  let high = sums.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (sums[middle] > target) high = middle
    else low = middle + 1
  }
  return low
}

const share = (mine: number, others: number[]) => {
  let tied = 1
  for (const other of others) {
    if (other > mine) return 0
    if (other === mine) tied += 1
  }
  return 1 / tied
}

/** 리버에서 상대가 한두 명이면 모든 조합 쌍을 센다. */
export function exactRiver(hero: [number, number], board: number[], ranges: ComboRange[]): Omit<EquityResult, 'combos'> {
  const [b0, b1, b2, b3, b4] = board
  const mine = evaluate7(hero[0], hero[1], b0, b1, b2, b3, b4)
  const scores = ranges.map((range) => Array.from(range.weights, (_, i) => evaluate7(range.first[i], range.second[i], b0, b1, b2, b3, b4)))
  const versus = (score: number) => (mine > score ? 1 : mine === score ? 0.5 : 0)
  if (ranges.length === 1) {
    const [range] = ranges
    let total = 0
    let won = 0
    range.weights.forEach((weight, i) => {
      total += weight
      won += weight * versus(scores[0][i])
    })
    if (total <= 0) throw new Error('상대 레인지가 비어 있습니다.')
    return { equity: won / total, versus: [won / total], exact: true, samples: 0 }
  }
  const [x, y] = ranges
  let total = 0
  let won = 0
  let wonX = 0
  let wonY = 0
  for (let i = 0; i < x.weights.length; i += 1) {
    const wx = x.weights[i]
    if (wx <= 0) continue
    const xa = x.first[i]
    const xb = x.second[i]
    for (let j = 0; j < y.weights.length; j += 1) {
      const wy = y.weights[j]
      if (wy <= 0) continue
      const ya = y.first[j]
      const yb = y.second[j]
      if (ya === xa || ya === xb || yb === xa || yb === xb) continue
      const weight = wx * wy
      total += weight
      won += weight * share(mine, [scores[0][i], scores[1][j]])
      wonX += weight * versus(scores[0][i])
      wonY += weight * versus(scores[1][j])
    }
  }
  if (total <= 0) throw new Error('상대 레인지끼리 카드가 겹쳐 계산할 수 없습니다.')
  return { equity: won / total, versus: [wonX / total, wonY / total], exact: true, samples: 0 }
}

/** 상대마다 레인지에서 조합을 뽑고 남은 보드를 깔아 samples번 승부를 낸다. */
export function sampleEquity(hero: [number, number], board: number[], ranges: ComboRange[], samples: number, seed: number): Omit<EquityResult, 'combos'> {
  const random = seededRandom(seed)
  const sums = ranges.map((range) => cumulative(range.weights))
  if (sums.some((value) => value.length === 0 || value[value.length - 1] <= 0)) throw new Error('상대 레인지가 비어 있습니다.')
  const used = new Uint8Array(52)
  const deck = new Int32Array(52)
  const cards = new Int32Array(7)
  const picked = new Int32Array(ranges.length)
  const scores: number[] = Array.from({ length: ranges.length }, () => 0)
  const missing = 5 - board.length
  const versus = new Float64Array(ranges.length)
  let won = 0
  for (let s = 0; s < samples; s += 1) {
    // 겹치면 모두 다시 뽑는다. 그래야 겹치지 않는 조합들의 결합 분포를 그대로 따른다.
    let attempts = 0
    while (true) {
      used.fill(0)
      used[hero[0]] = used[hero[1]] = 1
      let clash = false
      for (let r = 0; r < ranges.length && !clash; r += 1) {
        const i = pick(sums[r], random)
        const a = ranges[r].first[i]
        const b = ranges[r].second[i]
        if (used[a] || used[b]) clash = true
        else {
          used[a] = used[b] = 1
          picked[r] = i
        }
      }
      if (!clash) break
      attempts += 1
      if (attempts > 2000) throw new Error('상대 레인지끼리 카드가 겹쳐 계산할 수 없습니다.')
    }
    for (const card of board) used[card] = 1
    let size = 0
    for (let card = 0; card < 52; card += 1) if (!used[card]) deck[size++] = card
    for (let k = 0; k < missing; k += 1) {
      const j = k + Math.floor(random() * (size - k))
      const swap = deck[k]
      deck[k] = deck[j]
      deck[j] = swap
    }
    for (let k = 0; k < board.length; k += 1) cards[k] = board[k]
    for (let k = 0; k < missing; k += 1) cards[board.length + k] = deck[k]
    const [b0, b1, b2, b3, b4] = cards
    const mine = evaluate7(hero[0], hero[1], b0, b1, b2, b3, b4)
    for (let r = 0; r < ranges.length; r += 1) {
      const i = picked[r]
      scores[r] = evaluate7(ranges[r].first[i], ranges[r].second[i], b0, b1, b2, b3, b4)
      versus[r] += mine > scores[r] ? 1 : mine === scores[r] ? 0.5 : 0
    }
    won += share(mine, scores)
  }
  return { equity: won / samples, versus: Array.from(versus, (value) => value / samples), exact: false, samples }
}

/** 상대 레인지를 좁히고 내 승률을 센다. */
export function computeEquity(request: EquityRequest): EquityResult {
  const { hero, board, opponents, samples, seed } = request
  if (opponents.length === 0) throw new Error('남은 상대가 없습니다.')
  const ranges = opponents.map((opponent, index) => opponentRange(opponent, hero, board, seed + index * 104_729))
  const combos = ranges.map((range) => Math.round(range.weights.reduce((sum, value) => sum + value, 0) * 10) / 10)
  const result = board.length === 5 && ranges.length <= 2 ? exactRiver(hero, board, ranges) : sampleEquity(hero, board, ranges, samples, seed)
  return { ...result, combos }
}
