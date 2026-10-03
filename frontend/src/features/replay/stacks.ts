import type { ReplayHand } from './model'

/**
 * index 칸까지 반영한 참가자의 남은 칩.
 * 시작 칩 − (index까지 낸 칩) + (결과 칸이면 받은 칩). 시작 칩 기록이 없으면 undefined.
 */
export function stackAt(hand: ReplayHand, playerId: string, index: number): number | undefined {
  const start = hand.startStacks[playerId]
  if (start === undefined) return undefined
  const played = hand.actions.slice(0, index + 1)
  const spent = played.reduce((sum, action) => sum + (action.playerId === playerId ? action.added : 0), 0)
  const payout = hand.actions[index]?.kind === 'result' ? (hand.payouts[playerId] ?? 0) : 0
  return start - spent + payout
}

/** index 칸까지 이번 스트리트에 낸 칩. 결과 칸에서는 0이다. */
export function streetBetAt(hand: ReplayHand, playerId: string, index: number): number {
  const current = hand.actions[index]
  if (!current || current.kind === 'result') return 0
  return hand.actions
    .slice(0, index + 1)
    .filter((action) => action.street === current.street && action.playerId === playerId)
    .reduce((sum, action) => sum + action.added, 0)
}

/** 결과 칸에서 가장 많이 받은 참가자 */
export function winnerOf(hand: ReplayHand): string | undefined {
  let winner: string | undefined
  for (const [playerId, amount] of Object.entries(hand.payouts)) {
    if (amount > 0 && (winner === undefined || amount > hand.payouts[winner])) winner = playerId
  }
  return winner
}

/**
 * 현재 액션 카드에 보여줄 남은 칩과 이번 칸으로 바뀐 양.
 * 액션 칸은 액션한 사람, 결과 칸은 승자 기준이다.
 */
export function stackFactAt(hand: ReplayHand, index: number): { playerId: string; stack: number; change: number } | undefined {
  const current = hand.actions[index]
  if (!current) return undefined
  const playerId = current.kind === 'result' ? winnerOf(hand) : current.playerId
  if (!playerId) return undefined
  const stack = stackAt(hand, playerId, index)
  if (stack === undefined) return undefined
  const change = current.kind === 'result' ? (hand.payouts[playerId] ?? 0) : 0 - current.added
  return { playerId, stack, change }
}
