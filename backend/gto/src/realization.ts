import { HAND_COUNT, handRanks, handShape } from './cards'

/**
 * 플랍 이후를 풀지 않고 "에퀴티를 얼마나 실현하는가"로 근사한다.
 *
 * 플랍을 본 두 사람의 팟 몫은 승률 e에 각자의 실현 계수 R을 곱해 정규화한다.
 *   OOP 몫 = e^k·R_oop / (e^k·R_oop + (1 − e)^k·R_ip)
 * 두 몫의 합은 언제나 1(제로섬)이다. k > 1은 앞선 핸드가 베팅으로 승률보다 더 가져가는 효과다.
 * R은 포지션(IP가 유리)과 핸드의 플레이 용이성(수티드·커넥터·페어는 더 잘 실현)으로 정한다.
 * 스택이 깊을수록(SPR이 클수록) 두 효과가 커진다.
 */

/** 깊은 스택에서 IP가 OOP보다 갖는 실현 계수 비율의 로그 */
export const POSITION_EDGE = 0.3

/** 깊은 스택에서 승률을 몇 제곱해 몫을 정할지에서 1을 뺀 값 */
export const EQUITY_SKEW = 0.2

/** 핸드별 실현 계수의 로그(평균 0 근처) */
export function playability(hand: number): number {
  const [high, low] = handRanks(hand)
  const shape = handShape(hand)
  if (shape === 'pair') return low <= 6 ? 0.04 : 0.02
  let score = 0
  if (shape === 'suited') score += 0.07
  // A-5 이하는 휠 스트레이트로 이어진다.
  const gap = high === 12 && low <= 3 ? low + 1 : high - low
  score += gap === 1 ? 0.04 : gap === 2 ? 0.025 : gap === 3 ? 0.01 : -0.02
  if (shape === 'offsuit') {
    if (low <= 7 && gap >= 3) score -= 0.03
    // 키커가 약한 오프수트 Q·K·A는 더 좋은 키커에 지배당하기 쉽다.
    if (high >= 10 && low <= 7) score -= 0.03
  }
  return score
}

const PLAYABILITY = Float64Array.from({ length: HAND_COUNT }, (_, hand) => playability(hand))

export function depthFactor(spr: number) {
  return Math.min(1.5, Math.max(0.25, spr / 8))
}

/**
 * 포지션·승률 기울기 효과가 스택 깊이에 따라 얼마나 남는지(0~1).
 * SPR이 낮아도 플랍 이후 결정이 남아 있으므로 절반 이상은 유지한다.
 */
export function postflopWeight(spr: number) {
  return Math.min(1, 0.5 + spr / 12)
}

/** 플랍 이후 앞선 핸드가 승률보다 더 많이 가져가는 정도(1이면 승률 그대로) */
export function skewFactor(spr: number) {
  return 1 + EQUITY_SKEW * postflopWeight(spr)
}

export function positionFactor(spr: number) {
  return POSITION_EDGE * postflopWeight(spr)
}

/**
 * 플랍을 본 팟에서 쓰는 두 행렬.
 * `oop[h*169+o]` = 조건부 확률 × (내가 OOP로 h, 상대가 IP로 o일 때 내 몫)
 * `ip[h*169+o]`  = 조건부 확률 × (내가 IP로 h, 상대가 OOP로 o일 때 내 몫)
 */
export function flopShareMatrices(equity: Float64Array, compat: Float64Array, spr: number) {
  const depth = depthFactor(spr)
  const edge = positionFactor(spr)
  const skew = skewFactor(spr)
  const oop = new Float64Array(HAND_COUNT * HAND_COUNT)
  const ip = new Float64Array(HAND_COUNT * HAND_COUNT)
  const share = (oopHand: number, ipHand: number) => {
    const e = equity[oopHand * HAND_COUNT + ipHand]
    const rOop = Math.exp(depth * PLAYABILITY[oopHand])
    const rIp = Math.exp(depth * PLAYABILITY[ipHand] + edge)
    const mine = e ** skew * rOop
    return mine / (mine + (1 - e) ** skew * rIp)
  }
  for (let h = 0; h < HAND_COUNT; h += 1) {
    for (let o = 0; o < HAND_COUNT; o += 1) {
      const index = h * HAND_COUNT + o
      oop[index] = compat[index] * share(h, o)
      ip[index] = compat[index] * (1 - share(o, h))
    }
  }
  return { oop, ip }
}

/** 올인 쇼다운: 조건부 확률 × 승률 */
export function showdownMatrix(equity: Float64Array, compat: Float64Array) {
  const matrix = new Float64Array(HAND_COUNT * HAND_COUNT)
  for (let index = 0; index < matrix.length; index += 1) matrix[index] = compat[index] * equity[index]
  return matrix
}
