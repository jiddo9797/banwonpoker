import { cardCode, createDeck, parseCards } from './cards'
import type { Card } from './cards'
import { seededRng } from './rng'
import { createTable, seatPlayer } from './table'
import type { EngineResult, TableState } from './types'

/** 테스트 전용: 실패하면 바로 던지고 성공한 상태만 돌려준다. */
export function unwrap(result: EngineResult) {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result
}

export const blinds = { smallBlind: 50, bigBlind: 100 }

export const rng = seededRng(1)

/** 좌석 0부터 차례로 앉힌 테이블. stacks를 주면 참가자별 칩을 정한다. */
export function tableWith(names: string[], stacks?: number[], startingStack = 10_000): TableState {
  let table = createTable({ startingStack })
  names.forEach((name, seat) => {
    table = unwrap(seatPlayer(table, { id: name, name, seat, stack: stacks?.[seat] })).table
  })
  return table
}

/**
 * 원하는 카드가 나오도록 덱을 만든다.
 * @param holes 딜러 왼쪽부터 나눠 줄 순서대로의 홀카드(예: 'As Kd')
 * @param board 보드 다섯 장(예: 'Ks 9h 4h 2c Jh')
 */
export function stackedDeck(holes: string[], board: string): Card[] {
  const holeCards = holes.map((codes) => parseCards(codes))
  const boardCards = parseCards(board)
  const used = new Set([...holeCards.flat(), ...boardCards].map(cardCode))
  const rest = createDeck().filter((card) => !used.has(cardCode(card)))
  const burn = () => rest.shift() as Card

  const deck: Card[] = []
  for (let round = 0; round < 2; round += 1) for (const cards of holeCards) deck.push(cards[round])
  deck.push(burn(), ...boardCards.slice(0, 3), burn(), boardCards[3], burn(), boardCards[4])
  return [...deck, ...rest]
}
