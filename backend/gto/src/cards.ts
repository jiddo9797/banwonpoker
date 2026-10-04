/**
 * 프리플랍 핸드 169종.
 *
 * 카드는 정수 `rank * 4 + suit`로 다룬다. rank는 0(2)~12(A), suit는 0~3.
 * 핸드 인덱스는 13×13 표의 칸과 같다: `row * 13 + col`, row·col 0이 A.
 * 대각선은 페어, 오른쪽 위(col > row)는 수티드, 왼쪽 아래(row > col)는 오프수트.
 */

export const RANK_CHARS = '23456789TJQKA'
export const HAND_COUNT = 169
export const TOTAL_COMBOS = 1326

export type HandShape = 'pair' | 'suited' | 'offsuit'

/** 표의 줄(또는 칸) 번호 → 카드 rank(0=2 … 12=A) */
export const rankOfLine = (line: number) => 12 - line

export function handShape(hand: number): HandShape {
  const row = Math.floor(hand / 13)
  const col = hand % 13
  if (row === col) return 'pair'
  return col > row ? 'suited' : 'offsuit'
}

/** 높은 rank, 낮은 rank (0=2 … 12=A) */
export function handRanks(hand: number): [number, number] {
  const row = Math.floor(hand / 13)
  const col = hand % 13
  const a = rankOfLine(row)
  const b = rankOfLine(col)
  return a >= b ? [a, b] : [b, a]
}

/** 'AKs', 'QQ', 'T9o' */
export function handLabel(hand: number): string {
  const [high, low] = handRanks(hand)
  const shape = handShape(hand)
  const ranks = RANK_CHARS[high] + RANK_CHARS[low]
  if (shape === 'pair') return ranks
  return ranks + (shape === 'suited' ? 's' : 'o')
}

export function handIndex(label: string): number {
  const high = RANK_CHARS.indexOf(label[0])
  const low = RANK_CHARS.indexOf(label[1])
  if (high < 0 || low < 0) throw new Error(`알 수 없는 핸드: ${label}`)
  const a = 12 - Math.max(high, low)
  const b = 12 - Math.min(high, low)
  if (a === b) return a * 13 + a
  return label[2] === 's' ? a * 13 + b : b * 13 + a
}

export function comboCount(hand: number): number {
  const shape = handShape(hand)
  return shape === 'pair' ? 6 : shape === 'suited' ? 4 : 12
}

/** 핸드의 모든 조합. 각 조합은 카드 정수 두 개. */
export function handCombos(hand: number): Array<[number, number]> {
  const [high, low] = handRanks(hand)
  const shape = handShape(hand)
  const combos: Array<[number, number]> = []
  for (let s1 = 0; s1 < 4; s1 += 1) {
    for (let s2 = 0; s2 < 4; s2 += 1) {
      if (shape === 'pair' && s2 <= s1) continue
      if (shape === 'suited' && s1 !== s2) continue
      if (shape === 'offsuit' && s1 === s2) continue
      combos.push([high * 4 + s1, low * 4 + s2])
    }
  }
  return combos
}

/** 무작위로 받은 두 장이 이 핸드일 확률 */
export const handPrior: Float64Array = (() => {
  const prior = new Float64Array(HAND_COUNT)
  for (let hand = 0; hand < HAND_COUNT; hand += 1) prior[hand] = comboCount(hand) / TOTAL_COMBOS
  return prior
})()

/**
 * `compat[h * 169 + o]`: 내 h 조합 하나와 겹치지 않는 상대 o 조합 수의 평균을
 * 남은 카드로 만들 수 있는 조합 수(C(50,2)=1225)로 나눈 값.
 * 즉 내가 h를 들었을 때 상대가 o일 조건부 확률이다. 한 줄의 합은 1이다.
 */
export function compatibilityMatrix(): Float64Array {
  const combos = Array.from({ length: HAND_COUNT }, (_, hand) => handCombos(hand))
  const matrix = new Float64Array(HAND_COUNT * HAND_COUNT)
  for (let h = 0; h < HAND_COUNT; h += 1) {
    for (let o = 0; o < HAND_COUNT; o += 1) {
      let pairs = 0
      for (const [a, b] of combos[h]) {
        for (const [c, d] of combos[o]) {
          if (a !== c && a !== d && b !== c && b !== d) pairs += 1
        }
      }
      matrix[h * HAND_COUNT + o] = pairs / combos[h].length / 1225
    }
  }
  return matrix
}
