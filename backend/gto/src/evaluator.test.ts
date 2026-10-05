import { compareHands, evaluateBest, suits } from '@banwonpoker/engine'
import type { Card, Rank } from '@banwonpoker/engine'
import { describe, expect, it } from 'vitest'
import { seededRandom } from './equity'
import { evaluate7, evaluateCards } from './evaluator'

const toEngineCard = (card: number): Card => ({ rank: ((card >> 2) + 2) as Rank, suit: suits[card & 3] })

function drawCards(random: () => number, count = 7): number[] {
  const deck = Array.from({ length: 52 }, (_, card) => card)
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (52 - i))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, count)
}

const score = (cards: number[]) => evaluate7(cards[0], cards[1], cards[2], cards[3], cards[4], cards[5], cards[6])

describe('evaluate7', () => {
  it('엔진의 족보 비교와 같은 승패를 낸다', () => {
    const random = seededRandom(42)
    for (let round = 0; round < 3000; round += 1) {
      const a = drawCards(random)
      const b = drawCards(random)
      const expected = Math.sign(compareHands(evaluateBest(a.map(toEngineCard)), evaluateBest(b.map(toEngineCard))))
      expect(Math.sign(score(a) - score(b)), `${a} vs ${b}`).toBe(expected)
    }
  })

  it('다섯·여섯 장도 엔진과 같은 승패를 내고, 일곱 장은 evaluate7과 같다', () => {
    const random = seededRandom(7)
    for (let round = 0; round < 2000; round += 1) {
      const count = 5 + (round % 2)
      const a = drawCards(random, count)
      const b = drawCards(random, count)
      const expected = Math.sign(compareHands(evaluateBest(a.map(toEngineCard)), evaluateBest(b.map(toEngineCard))))
      expect(Math.sign(evaluateCards(a) - evaluateCards(b)), `${a} vs ${b}`).toBe(expected)
      const seven = drawCards(random)
      expect(evaluateCards(seven)).toBe(score(seven))
    }
  })

  it('휠 스트레이트와 스트레이트 플러시를 알아본다', () => {
    // A♠ 2♠ 3♠ 4♠ 5♠ + K♥ Q♥
    const wheelFlush = [48, 0, 4, 8, 12, 45, 41]
    // A♠ 2♥ 3♠ 4♦ 5♣ + K♥ Q♥
    const wheel = [48, 1, 4, 10, 15, 45, 41]
    expect(score(wheelFlush) >> 20).toBe(8)
    expect(score(wheel) >> 20).toBe(4)
  })
})
