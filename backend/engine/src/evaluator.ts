import { rankNames } from './cards'
import type { Card, Rank } from './cards'

export const handCategories = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
] as const

export type HandCategory = (typeof handCategories)[number]

export interface HandValue {
  category: HandCategory
  /** 같은 족보끼리 비교할 숫자들. 앞에서부터 큰 쪽이 이긴다. */
  tiebreak: Rank[]
  /** 족보를 이루는 다섯 장 */
  cards: Card[]
}

function straightHigh(uniqueRanksDesc: Rank[]): Rank | undefined {
  for (let start = 0; start + 4 < uniqueRanksDesc.length; start += 1) {
    if (uniqueRanksDesc[start] - uniqueRanksDesc[start + 4] === 4) return uniqueRanksDesc[start]
  }
  // A-2-3-4-5(휠)는 5가 가장 높은 스트레이트다.
  const wheel: Rank[] = [14, 5, 4, 3, 2]
  if (wheel.every((rank) => uniqueRanksDesc.includes(rank))) return 5
  return undefined
}

/** 정확히 다섯 장의 족보를 계산한다. */
export function evaluateFive(cards: Card[]): HandValue {
  if (cards.length !== 5) throw new Error('evaluateFive는 카드 다섯 장이 필요합니다.')

  const sorted = [...cards].sort((a, b) => b.rank - a.rank)
  const ranksDesc = sorted.map((card) => card.rank)
  const flush = sorted.every((card) => card.suit === sorted[0].suit)
  const high = straightHigh([...new Set(ranksDesc)])

  const counts = new Map<Rank, number>()
  for (const rank of ranksDesc) counts.set(rank, (counts.get(rank) ?? 0) + 1)
  // 장수가 많은 순, 같으면 숫자가 큰 순
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const groupRanks = groups.map(([rank]) => rank)
  const shape = groups.map(([, count]) => count).join('')

  if (high !== undefined && flush) return { category: 'straight-flush', tiebreak: [high], cards: sorted }
  if (shape === '41') return { category: 'four-of-a-kind', tiebreak: groupRanks, cards: sorted }
  if (shape === '32') return { category: 'full-house', tiebreak: groupRanks, cards: sorted }
  if (flush) return { category: 'flush', tiebreak: ranksDesc, cards: sorted }
  if (high !== undefined) return { category: 'straight', tiebreak: [high], cards: sorted }
  if (shape === '311') return { category: 'three-of-a-kind', tiebreak: groupRanks, cards: sorted }
  if (shape === '221') return { category: 'two-pair', tiebreak: groupRanks, cards: sorted }
  if (shape === '2111') return { category: 'one-pair', tiebreak: groupRanks, cards: sorted }
  return { category: 'high-card', tiebreak: ranksDesc, cards: sorted }
}

/** 양수면 a가, 음수면 b가 이긴다. 0이면 비긴다. */
export function compareHands(a: HandValue, b: HandValue): number {
  const byCategory = handCategories.indexOf(a.category) - handCategories.indexOf(b.category)
  if (byCategory !== 0) return byCategory
  for (let index = 0; index < Math.max(a.tiebreak.length, b.tiebreak.length); index += 1) {
    const difference = (a.tiebreak[index] ?? 0) - (b.tiebreak[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [first, ...rest] = items
  return [...combinations(rest, size - 1).map((combo) => [first, ...combo]), ...combinations(rest, size)]
}

/** 5~7장에서 가장 좋은 다섯 장의 족보를 고른다. */
export function evaluateBest(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluateBest는 카드 5~7장이 필요합니다.')
  let best: HandValue | undefined
  for (const combo of combinations(cards, 5)) {
    const value = evaluateFive(combo)
    if (!best || compareHands(value, best) > 0) best = value
  }
  return best as HandValue
}

/** 복기와 테이블 문구에 쓰는 한국어 족보 이름. 예: `세븐 원 페어`, `에이스 하이 플러시` */
export function handName(value: HandValue): string {
  const [first, second] = value.tiebreak
  const name = (rank: Rank) => rankNames[rank]

  switch (value.category) {
    case 'straight-flush':
      return first === 14 ? '로열 플러시' : `${name(first)} 하이 스트레이트 플러시`
    case 'four-of-a-kind':
      return `${name(first)} 포카드`
    case 'full-house':
      return `${name(first)} 풀 하우스`
    case 'flush':
      return `${name(first)} 하이 플러시`
    case 'straight':
      return `${name(first)} 하이 스트레이트`
    case 'three-of-a-kind':
      return `${name(first)} 트리플`
    case 'two-pair':
      return `${name(first)}·${name(second)} 투 페어`
    case 'one-pair':
      return `${name(first)} 원 페어`
    case 'high-card':
      return `${name(first)} 하이`
  }
}
