/** 프리플랍 행동 순서대로 적은 포지션 이름. 2인에서는 딜러(BTN)가 스몰 블라인드를 낸다. */
export const POSITIONS: Record<number, readonly string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

export function positionsOf(players: number): readonly string[] {
  const names = POSITIONS[players]
  if (!names) throw new Error(`지원하지 않는 인원: ${players}`)
  return names
}

export const smallBlindIndex = (players: number) => (players === 2 ? 0 : players - 2)
export const bigBlindIndex = (players: number) => players - 1

/** 플랍부터 행동하는 순서(0이 먼저). 숫자가 큰 쪽이 포지션(IP)을 가진다. */
export function postflopOrder(players: number, index: number): number {
  if (players === 2) return index === 1 ? 0 : 1
  if (index === players - 2) return 0
  if (index === players - 1) return 1
  return index + 2
}
