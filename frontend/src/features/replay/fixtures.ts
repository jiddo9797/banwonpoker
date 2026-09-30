import type { Card } from '../table/model'
import type { AudioStatus, HandAction, ReplayHand, ReplayPlayer, SessionSummary, Street } from './model'

export const HERO_ID = 'hero'

const card = (rank: string, suit: Card['suit']): Card => ({ rank, suit })

const players: ReplayPlayer[] = [
  { id: 'eugene', name: '유진', position: 'bottom-left', badge: 'SB', cards: [card('5', 'diamond'), card('3', 'club')] },
  { id: 'seojun', name: '서준', position: 'top-left', badge: 'BB', cards: [card('7', 'club'), card('7', 'diamond')] },
  { id: 'minsu', name: '민수', position: 'top-center', cards: [card('Q', 'club'), card('J', 'club')] },
  { id: 'jihun', name: '지훈', position: 'top-right', cards: [card('8', 'spade'), card('6', 'spade')] },
  { id: 'subin', name: '수빈', position: 'bottom-right', cards: [card('K', 'diamond'), card('9', 'diamond')] },
  { id: HERO_ID, name: '나', position: 'hero', badge: 'D', cards: [card('A', 'heart'), card('K', 'heart')] },
]

type ActionSpec = [
  street: Street,
  playerId: string | undefined,
  kind: HandAction['kind'],
  label: string,
  added: number,
  thinkSeconds: number | undefined,
  audio: AudioStatus,
  audioSeconds?: number,
]

/** 액션 목록에서 칸 id와 누적 팟을 계산한다. */
function buildActions(handNumber: number, specs: ActionSpec[]): HandAction[] {
  let pot = 0
  return specs.map(([street, playerId, kind, label, added, thinkSeconds, status, seconds], index) => {
    pot += added
    return {
      id: `h${handNumber}-a${index + 1}`,
      street,
      playerId,
      kind,
      label,
      pot,
      thinkSeconds,
      audio: { status, seconds },
    }
  })
}

const hand24: ReplayHand = {
  number: 24,
  board: [card('K', 'spade'), card('9', 'heart'), card('4', 'heart'), card('2', 'club'), card('J', 'heart')],
  players,
  result: '나 승리 · 에이스 하이 플러시 +6,650',
  actions: buildActions(24, [
    ['preflop', 'eugene', 'blind', 'SB 50', 50, undefined, 'none'],
    ['preflop', 'seojun', 'blind', 'BB 100', 100, undefined, 'none'],
    ['preflop', 'minsu', 'call', '콜 100', 100, 6, 'voice', 4],
    ['preflop', 'jihun', 'call', '콜 100', 100, 3, 'silent'],
    ['preflop', 'subin', 'call', '콜 100', 100, 5, 'voice', 3],
    ['preflop', HERO_ID, 'call', '콜 100', 100, 8, 'voice', 6],
    ['preflop', 'eugene', 'fold', '폴드', 0, 4, 'voiceless'],
    ['preflop', 'seojun', 'check', '체크', 0, 2, 'silent'],
    ['flop', 'seojun', 'bet', '베팅 300', 300, 11, 'voice', 9],
    ['flop', 'minsu', 'call', '콜 300', 300, 7, 'voice', 5],
    ['flop', 'jihun', 'fold', '폴드', 0, 4, 'failed'],
    ['flop', 'subin', 'raise', '레이즈 900', 900, 18, 'voice', 14],
    ['flop', HERO_ID, 'call', '콜 900', 900, 26, 'voice', 21],
    ['flop', 'seojun', 'call', '콜 900', 600, 9, 'voice', 7],
    ['flop', 'minsu', 'fold', '폴드', 0, 12, 'missing'],
    ['turn', 'seojun', 'check', '체크', 0, 3, 'silent'],
    ['turn', 'subin', 'bet', '베팅 1,000', 1_000, 15, 'voice', 10],
    ['turn', HERO_ID, 'call', '콜 1,000', 1_000, 14, 'voice', 12],
    ['turn', 'seojun', 'fold', '폴드', 0, 8, 'voice', 6],
    ['river', 'subin', 'check', '체크', 0, 5, 'voice', 4],
    ['river', HERO_ID, 'bet', '베팅 550', 550, 22, 'voice', 17],
    ['river', 'subin', 'call', '콜 550', 550, 13, 'voice', 9],
    ['showdown', undefined, 'result', '나 승리 +6,650', 0, undefined, 'none'],
  ]),
}

const hand23: ReplayHand = {
  number: 23,
  board: [card('Q', 'diamond'), card('8', 'club'), card('3', 'spade'), card('7', 'heart'), card('2', 'diamond')],
  players: players.map((player) => ({
    ...player,
    badge: player.id === 'eugene' ? 'D' : player.id === 'seojun' ? 'SB' : player.id === 'minsu' ? 'BB' : undefined,
    cards:
      player.id === 'minsu'
        ? [card('Q', 'heart'), card('Q', 'spade')]
        : player.id === HERO_ID
          ? [card('9', 'club'), card('4', 'diamond')]
          : player.cards,
  })),
  result: '민수 승리 · 퀸 트리플 +1,000',
  actions: buildActions(23, [
    ['preflop', 'seojun', 'blind', 'SB 50', 50, undefined, 'none'],
    ['preflop', 'minsu', 'blind', 'BB 100', 100, undefined, 'none'],
    ['preflop', 'jihun', 'fold', '폴드', 0, 2, 'silent'],
    ['preflop', 'subin', 'fold', '폴드', 0, 3, 'voice', 2],
    ['preflop', HERO_ID, 'fold', '폴드', 0, 4, 'voice', 3],
    ['preflop', 'eugene', 'fold', '폴드', 0, 2, 'voiceless'],
    ['preflop', 'seojun', 'raise', '레이즈 300', 250, 9, 'voice', 6],
    ['preflop', 'minsu', 'call', '콜 300', 200, 6, 'voice', 4],
    ['flop', 'seojun', 'check', '체크', 0, 5, 'silent'],
    ['flop', 'minsu', 'bet', '베팅 400', 400, 10, 'voice', 8],
    ['flop', 'seojun', 'fold', '폴드', 0, 14, 'voice', 11],
    ['showdown', undefined, 'result', '민수 승리 +1,000', 0, undefined, 'none'],
  ]),
}

export const replayHands: ReplayHand[] = [hand23, hand24]

export function getReplayHand(handNumber: number): ReplayHand {
  return replayHands.find((hand) => hand.number === handNumber) ?? hand24
}

export const LATEST_HAND_NUMBER = 24

export const streetLabels: Record<Street, string> = {
  preflop: '프리플랍',
  flop: '플랍',
  turn: '턴',
  river: '리버',
  showdown: '결과',
}

/** 스트리트별로 공개되는 커뮤니티 카드 수 */
export const visibleBoardCount: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
}

export const sessionSummary: SessionSummary = {
  roomName: '금요일 밤 홀덤',
  durationMinutes: 78,
  handCount: 25,
  startingStack: 10_000,
  results: [
    { playerId: HERO_ID, name: '나', finalStack: 21_000, delta: 11_000 },
    { playerId: 'minsu', name: '민수', finalStack: 13_650, delta: 3_650 },
    { playerId: 'eugene', name: '유진', finalStack: 9_100, delta: -900 },
    { playerId: 'subin', name: '수빈', finalStack: 9_050, delta: -950 },
    { playerId: 'jihun', name: '지훈', finalStack: 7_200, delta: -2_800 },
    { playerId: 'seojun', name: '서준', finalStack: 0, delta: -10_000, eliminatedAtHand: 25 },
  ],
  selfRecording: {
    turns: 41,
    saved: 37,
    silent: 2,
    failed: 1,
    missing: 1,
  },
  hands: [
    { number: 24, winner: '나', delta: 6_650, note: '쇼다운 · 에이스 하이 플러시' },
    { number: 23, winner: '민수', delta: 1_000, note: '플랍에서 종료' },
  ],
}
