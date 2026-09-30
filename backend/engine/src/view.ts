import type { Card } from './cards'
import { legalActions } from './table'
import type { HandPhase, LegalActions, PlayerStatus, PotAward, ShowdownReveal, TableState } from './types'

export interface SeatView {
  id: string
  name: string
  seat: number
  stack: number
  status: PlayerStatus
  /** 이번 핸드에 참여 중인지. 핸드 중에 앉은 사람은 다음 핸드부터 참여한다. */
  inHand: boolean
  folded: boolean
  allIn: boolean
  streetCommitted: number
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  isTurn: boolean
  /** 내 카드이거나 쇼다운에서 공개된 카드만 있다. 나머지는 null */
  holeCards: [Card, Card] | null
  place?: number
}

export interface PlayerView {
  viewerId: string
  handNumber: number | null
  phase: HandPhase | null
  board: Card[]
  /** 이번 핸드에 쌓인 전체 칩 */
  potTotal: number
  currentBet: number
  seats: SeatView[]
  toAct: string | null
  /** 내 차례일 때만 있다 */
  legal?: LegalActions
  showdown: ShowdownReveal[]
  awards: PotAward[]
  eventSeq: number
}

/**
 * 한 참가자에게 보낼 화면 데이터. 남은 덱과 다른 사람의 비공개 홀카드는 절대 넣지 않는다.
 * 관전자나 아직 앉지 않은 사람에게도 쓸 수 있다.
 */
export function playerView(table: TableState, viewerId: string): PlayerView {
  const hand = table.hand
  const revealed = new Map((hand?.showdown ?? []).map((reveal) => [reveal.playerId, reveal.cards]))
  const handPlayers = new Map((hand?.players ?? []).map((player) => [player.id, player]))
  const active = hand !== null && hand.phase !== 'complete'

  return {
    viewerId,
    handNumber: hand?.number ?? null,
    phase: hand?.phase ?? null,
    board: [...(hand?.board ?? [])],
    potTotal: (hand?.players ?? []).reduce((sum, player) => sum + (active ? player.totalCommitted : 0), 0),
    currentBet: active ? (hand?.currentBet ?? 0) : 0,
    seats: [...table.players]
      .filter((player) => player.status !== 'left')
      .sort((a, b) => a.seat - b.seat)
      .map((player) => {
        const inHand = handPlayers.get(player.id)
        const cards = inHand && (player.id === viewerId || revealed.has(player.id)) ? inHand.holeCards : null
        return {
          id: player.id,
          name: player.name,
          seat: player.seat,
          stack: player.stack,
          status: player.status,
          inHand: Boolean(inHand) && active,
          folded: inHand?.folded ?? false,
          allIn: inHand?.allIn ?? false,
          streetCommitted: active ? (inHand?.streetCommitted ?? 0) : 0,
          isDealer: hand?.dealerSeat === player.seat,
          isSmallBlind: hand?.smallBlindSeat === player.seat,
          isBigBlind: hand?.bigBlindSeat === player.seat,
          isTurn: active && hand?.toAct === player.id,
          holeCards: cards ? [{ ...cards[0] }, { ...cards[1] }] : null,
          place: player.place,
        }
      }),
    toAct: active ? (hand?.toAct ?? null) : null,
    legal: legalActions(table, viewerId),
    showdown: structuredClone(hand?.showdown ?? []),
    awards: structuredClone(hand?.awards ?? []),
    eventSeq: table.eventSeq,
  }
}
