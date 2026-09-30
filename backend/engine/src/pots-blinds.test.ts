import { describe, expect, it } from 'vitest'
import { blindLevelAt, blindLevelIndexAt, msUntilNextLevel } from './blinds'
import type { BlindSchedule } from './blinds'
import { cardCode, createDeck, parseCard } from './cards'
import { buildPots, splitPot } from './pots'
import { seededRng, shuffle } from './rng'

describe('buildPots', () => {
  it('모두 같은 금액이면 팟 하나', () => {
    expect(
      buildPots([
        { playerId: 'a', amount: 300, folded: false },
        { playerId: 'b', amount: 300, folded: false },
        { playerId: 'c', amount: 300, folded: false },
      ]),
    ).toEqual([{ amount: 900, eligible: ['a', 'b', 'c'] }])
  })

  it('올인 금액이 다르면 메인·사이드 팟으로 나눈다', () => {
    const pots = buildPots([
      { playerId: 'short', amount: 100, folded: false },
      { playerId: 'mid', amount: 400, folded: false },
      { playerId: 'big', amount: 1_000, folded: false },
      { playerId: 'big2', amount: 1_000, folded: false },
    ])
    expect(pots).toEqual([
      { amount: 400, eligible: ['short', 'mid', 'big', 'big2'] },
      { amount: 900, eligible: ['mid', 'big', 'big2'] },
      { amount: 1_200, eligible: ['big', 'big2'] },
    ])
  })

  it('폴드한 사람의 칩은 팟에 들어가지만 가져갈 수 없다', () => {
    const pots = buildPots([
      { playerId: 'folder', amount: 300, folded: true },
      { playerId: 'short', amount: 200, folded: false },
      { playerId: 'big', amount: 600, folded: false },
    ])
    expect(pots).toEqual([
      { amount: 600, eligible: ['short', 'big'] },
      { amount: 500, eligible: ['big'] },
    ])
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(1_100)
  })

  it('가장 많이 낸 사람이 폴드했으면 남는 칩은 마지막 팟에 더한다', () => {
    const pots = buildPots([
      { playerId: 'folder', amount: 500, folded: true },
      { playerId: 'a', amount: 200, folded: false },
      { playerId: 'b', amount: 200, folded: false },
    ])
    expect(pots).toEqual([{ amount: 900, eligible: ['a', 'b'] }])
  })
})

describe('splitPot', () => {
  it('나누어떨어지지 않는 칩은 딜러 왼쪽에 가까운 승자부터 준다', () => {
    expect(splitPot(1_001, ['c', 'a'], ['a', 'b', 'c'])).toEqual([
      { playerId: 'a', amount: 501 },
      { playerId: 'c', amount: 500 },
    ])
    expect(splitPot(100, ['b', 'a', 'c'], ['c', 'a', 'b'])).toEqual([
      { playerId: 'c', amount: 34 },
      { playerId: 'a', amount: 33 },
      { playerId: 'b', amount: 33 },
    ])
  })
})

describe('블라인드 레벨', () => {
  const schedule: BlindSchedule = {
    mode: 'increasing',
    levelDurationMs: 15 * 60_000,
    levels: [
      { smallBlind: 50, bigBlind: 100 },
      { smallBlind: 100, bigBlind: 200 },
      { smallBlind: 150, bigBlind: 300 },
    ],
  }

  it('간격마다 한 레벨씩 오르고 마지막 레벨을 유지한다', () => {
    expect(blindLevelIndexAt(schedule, 0)).toBe(0)
    expect(blindLevelIndexAt(schedule, 15 * 60_000 - 1)).toBe(0)
    expect(blindLevelIndexAt(schedule, 15 * 60_000)).toBe(1)
    expect(blindLevelAt(schedule, 31 * 60_000)).toEqual({ smallBlind: 150, bigBlind: 300 })
    expect(blindLevelIndexAt(schedule, 10 * 60 * 60_000)).toBe(2)
    expect(blindLevelIndexAt(schedule, -5)).toBe(0)
  })

  it('다음 레벨까지 남은 시간을 알려주고, 마지막 레벨이나 고정이면 없다', () => {
    expect(msUntilNextLevel(schedule, 3 * 60_000)).toBe(12 * 60_000)
    expect(msUntilNextLevel(schedule, 40 * 60_000)).toBeUndefined()
    expect(msUntilNextLevel({ ...schedule, mode: 'fixed' }, 0)).toBeUndefined()
  })

  it('고정이면 시간이 지나도 첫 레벨이다', () => {
    expect(blindLevelAt({ ...schedule, mode: 'fixed' }, 99 * 60_000)).toEqual({ smallBlind: 50, bigBlind: 100 })
  })
})

describe('카드와 셔플', () => {
  it('덱은 서로 다른 52장이다', () => {
    expect(new Set(createDeck().map(cardCode)).size).toBe(52)
  })

  it('카드 표기를 읽고 잘못된 표기는 거부한다', () => {
    expect(parseCard('Td')).toEqual({ rank: 10, suit: 'diamond' })
    expect(parseCard('as')).toEqual({ rank: 14, suit: 'spade' })
    expect(() => parseCard('1x')).toThrow()
    expect(() => parseCard('Asd')).toThrow()
  })

  it('같은 시드는 같은 순서, 다른 시드는 다른 순서로 섞고 원본은 그대로 둔다', () => {
    const deck = createDeck()
    const a = shuffle(deck, seededRng(42)).map(cardCode)
    const b = shuffle(deck, seededRng(42)).map(cardCode)
    const c = shuffle(deck, seededRng(43)).map(cardCode)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(new Set(a).size).toBe(52)
    expect(deck.map(cardCode)).toEqual(createDeck().map(cardCode))
  })

  it('셔플은 치우치지 않는다(첫 자리의 카드 분포)', () => {
    const rng = seededRng(7)
    const counts = new Map<string, number>()
    for (let run = 0; run < 26_000; run += 1) {
      const first = cardCode(shuffle(createDeck(), rng)[0])
      counts.set(first, (counts.get(first) ?? 0) + 1)
    }
    expect(counts.size).toBe(52)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(350)
      expect(count).toBeLessThan(650)
    }
  })
})
