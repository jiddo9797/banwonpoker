export const suits = ['spade', 'heart', 'diamond', 'club'] as const

export type Suit = (typeof suits)[number]

/** 2~14. 14가 에이스다. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14

export const ranks: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export interface Card {
  rank: Rank
  suit: Suit
}

const rankSymbols: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
}

const suitSymbols: Record<Suit, string> = { spade: 's', heart: 'h', diamond: 'd', club: 'c' }

/** 족보 이름에 쓰는 한국어 숫자 이름 */
export const rankNames: Record<Rank, string> = {
  2: '투',
  3: '쓰리',
  4: '포',
  5: '파이브',
  6: '식스',
  7: '세븐',
  8: '에이트',
  9: '나인',
  10: '텐',
  11: '잭',
  12: '퀸',
  13: '킹',
  14: '에이스',
}

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })))
}

/** `As`, `Td`처럼 두 글자로 표현한다. 로그와 테스트에 쓴다. */
export function cardCode(card: Card): string {
  return `${rankSymbols[card.rank]}${suitSymbols[card.suit]}`
}

const rankBySymbol = new Map(ranks.map((rank) => [rankSymbols[rank], rank]))
const suitBySymbol = new Map(suits.map((suit) => [suitSymbols[suit], suit]))

export function parseCard(code: string): Card {
  const text = code.trim()
  const rank = rankBySymbol.get(text.charAt(0).toUpperCase())
  const suit = suitBySymbol.get(text.charAt(1).toLowerCase())
  if (text.length !== 2 || !rank || !suit) throw new Error(`카드 표기를 읽을 수 없습니다: ${code}`)
  return { rank, suit }
}

/** `'As Kh 9c'`처럼 공백으로 나눈 카드 목록을 읽는다. */
export function parseCards(codes: string): Card[] {
  return codes
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard)
}

export function sameCard(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit
}
