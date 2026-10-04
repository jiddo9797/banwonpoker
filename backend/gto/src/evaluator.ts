/**
 * 승률표를 만들 때 쓰는 빠른 7장 족보 계산.
 *
 * 엔진의 `evaluateBest`는 21가지 다섯 장 조합을 모두 비교해 결과가 읽기 쉽지만,
 * 승률표에는 수억 번을 돌려야 하므로 무늬별 비트마스크로 한 번에 계산한다.
 * 결과는 큰 쪽이 이기는 정수다: `족보 << 20 | 비교 숫자 다섯 개(4비트씩)`.
 */

const STRAIGHT_HIGH = new Int8Array(1 << 13)
const BIT_COUNT = new Uint8Array(1 << 13)

for (let mask = 0; mask < 1 << 13; mask += 1) {
  let bits = 0
  for (let r = 0; r < 13; r += 1) if (mask & (1 << r)) bits += 1
  BIT_COUNT[mask] = bits
  let high = -1
  for (let top = 12; top >= 4; top -= 1) {
    const need = 0x1f << (top - 4)
    if ((mask & need) === need) {
      high = top
      break
    }
  }
  // A-2-3-4-5는 5가 가장 높다.
  if (high < 0 && (mask & 0x100f) === 0x100f) high = 3
  STRAIGHT_HIGH[mask] = high
}

/** 마스크에서 높은 rank부터 count개를 4비트씩 이어 붙여 다섯 칸 자리에 맞춘다. */
function topBits(mask: number, count: number): number {
  let result = 0
  let taken = 0
  for (let r = 12; r >= 0 && taken < count; r -= 1) {
    if (mask & (1 << r)) {
      result = (result << 4) | r
      taken += 1
    }
  }
  return result << (4 * (5 - count))
}

function highestRank(mask: number): number {
  return 31 - Math.clz32(mask)
}

const counts = new Uint8Array(13)
const suitMasks = new Int32Array(4)

/** 카드 정수(rank*4+suit) 일곱 장의 족보 점수 */
export function evaluate7(c0: number, c1: number, c2: number, c3: number, c4: number, c5: number, c6: number): number {
  counts.fill(0)
  suitMasks.fill(0)
  counts[c0 >> 2] += 1
  counts[c1 >> 2] += 1
  counts[c2 >> 2] += 1
  counts[c3 >> 2] += 1
  counts[c4 >> 2] += 1
  counts[c5 >> 2] += 1
  counts[c6 >> 2] += 1
  suitMasks[c0 & 3] |= 1 << (c0 >> 2)
  suitMasks[c1 & 3] |= 1 << (c1 >> 2)
  suitMasks[c2 & 3] |= 1 << (c2 >> 2)
  suitMasks[c3 & 3] |= 1 << (c3 >> 2)
  suitMasks[c4 & 3] |= 1 << (c4 >> 2)
  suitMasks[c5 & 3] |= 1 << (c5 >> 2)
  suitMasks[c6 & 3] |= 1 << (c6 >> 2)
  const s0 = suitMasks[0]
  const s1 = suitMasks[1]
  const s2 = suitMasks[2]
  const s3 = suitMasks[3]
  const all = s0 | s1 | s2 | s3

  const flushMask = BIT_COUNT[s0] >= 5 ? s0 : BIT_COUNT[s1] >= 5 ? s1 : BIT_COUNT[s2] >= 5 ? s2 : BIT_COUNT[s3] >= 5 ? s3 : 0
  if (flushMask) {
    const straightFlush = STRAIGHT_HIGH[flushMask]
    if (straightFlush >= 0) return (8 << 20) | (straightFlush << 16)
  }

  let quad = -1
  let trip1 = -1
  let trip2 = -1
  let pair1 = -1
  let pair2 = -1
  let singles = 0
  for (let r = 12; r >= 0; r -= 1) {
    const n = counts[r]
    if (n === 4) quad = r
    else if (n === 3) {
      if (trip1 < 0) trip1 = r
      else trip2 = r
    } else if (n === 2) {
      if (pair1 < 0) pair1 = r
      else if (pair2 < 0) pair2 = r
      // 세 번째 페어는 키커 후보다.
      else singles |= 1 << r
    } else if (n === 1) singles |= 1 << r
  }

  // 쿼드의 키커는 트립·페어 카드일 수도 있다.
  if (quad >= 0) return (7 << 20) | (quad << 16) | (highestRank(all & ~(1 << quad)) << 12)
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) return (6 << 20) | (trip1 << 16) | (Math.max(trip2, pair1) << 12)
  if (flushMask) return (5 << 20) | topBits(flushMask, 5)
  const straight = STRAIGHT_HIGH[all]
  if (straight >= 0) return (4 << 20) | (straight << 16)
  if (trip1 >= 0) return (3 << 20) | (trip1 << 16) | (topBits(singles, 2) >> 4)
  if (pair2 >= 0) return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (highestRank(singles) << 8)
  if (pair1 >= 0) return (1 << 20) | (pair1 << 16) | (topBits(singles, 3) >> 4)
  return topBits(singles, 5)
}
