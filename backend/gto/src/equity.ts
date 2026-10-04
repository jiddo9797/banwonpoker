import { HAND_COUNT, handCombos } from './cards'
import { evaluate7 } from './evaluator'

/** 시드가 같으면 같은 수열을 내는 32비트 난수(mulberry32) */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 두 핸드가 프리플랍에 올인했을 때 h의 승률(비기면 절반).
 * 서로 겹치지 않는 조합 쌍과 보드를 무작위로 뽑아 samples번 돌린다.
 */
export function sampleEquity(h: number, o: number, samples: number, random: () => number): number {
  const mine = handCombos(h)
  const theirs = handCombos(o)
  const deck = new Int32Array(52)
  let score = 0
  let done = 0
  while (done < samples) {
    const [a, b] = mine[Math.floor(random() * mine.length)]
    const [c, d] = theirs[Math.floor(random() * theirs.length)]
    if (a === c || a === d || b === c || b === d) continue
    let size = 0
    for (let card = 0; card < 52; card += 1) {
      if (card !== a && card !== b && card !== c && card !== d) deck[size++] = card
    }
    // 앞의 다섯 장만 섞는다.
    for (let i = 0; i < 5; i += 1) {
      const j = i + Math.floor(random() * (size - i))
      const swap = deck[i]
      deck[i] = deck[j]
      deck[j] = swap
    }
    const mineScore = evaluate7(a, b, deck[0], deck[1], deck[2], deck[3], deck[4])
    const theirScore = evaluate7(c, d, deck[0], deck[1], deck[2], deck[3], deck[4])
    score += mineScore > theirScore ? 1 : mineScore === theirScore ? 0.5 : 0
    done += 1
  }
  return score / samples
}

/** 169×169 승률표의 한 줄 범위(h가 from 이상 to 미만)를 계산한다. o < h 칸은 대칭으로 채운다. */
export function equityRows(from: number, to: number, samples: number, seed: number): Float64Array {
  const rows = new Float64Array((to - from) * HAND_COUNT)
  for (let h = from; h < to; h += 1) {
    const random = seededRandom(seed + h * 7919)
    for (let o = h; o < HAND_COUNT; o += 1) {
      rows[(h - from) * HAND_COUNT + o] = h === o ? 0.5 : sampleEquity(h, o, samples, random)
    }
  }
  return rows
}
