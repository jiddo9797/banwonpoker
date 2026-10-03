import type { AudioStatus, ReplayData, ReplayHandData, TimedEvent } from './protocol'
import type { SessionRecord, StoredHand, StoredParticipant, StoredTurn } from './store'

/** 차례 하나의 음성 상태를 정한다. */
export function turnStatus(turn: StoredTurn | undefined, participant: StoredParticipant | undefined): { status: AudioStatus; durationMs: number | null } {
  if (!turn) return { status: 'missing', durationMs: null }
  if (turn.voiceless || participant?.voiceless) return { status: 'voiceless', durationMs: null }
  const report = turn.report
  if (report?.failed) return { status: 'failed', durationMs: null }
  if (report) {
    // 마이크가 켜지기 전에 차례가 끝났다: 말할 틈이 없었으므로 무발언으로 본다.
    if (report.chunks === 0) return { status: 'silent', durationMs: 0 }
    if (turn.receivedChunks < report.chunks) return { status: 'missing', durationMs: null }
    if (report.silent) return { status: 'silent', durationMs: report.durationMs }
    return { status: 'voice', durationMs: report.durationMs }
  }
  // 결과를 알리기 전에 연결이 끊겼다. 받은 조각이 있으면 들을 수 있는 만큼 들려준다.
  if (turn.receivedChunks > 0) {
    const duration = turn.endedMs !== null ? Math.max(0, turn.endedMs - turn.startedMs) : null
    return { status: 'voice', durationMs: duration }
  }
  return { status: 'missing', durationMs: null }
}

/** 저장된 이벤트·핸드·차례로 복기 데이터를 만든다. */
export function buildReplay(
  session: SessionRecord,
  participants: StoredParticipant[],
  hands: StoredHand[],
  events: TimedEvent[],
  turns: StoredTurn[],
): ReplayData {
  const byPlayer = new Map(participants.map((participant) => [participant.playerId, participant]))
  const byTurn = new Map(turns.map((turn) => [turn.turnSeq, turn]))
  const storedHands = new Map(hands.map((hand) => [hand.handNumber, hand]))
  const result: ReplayHandData[] = []

  let current: ReplayHandData | null = null
  let pot = 0
  const openTurn = new Map<string, { seq: number; time: number }>()

  for (const event of events) {
    if (event.type === 'hand-started') {
      const stored = storedHands.get(event.handNumber)
      current = {
        number: event.handNumber,
        dealerSeat: event.dealerSeat,
        blinds: event.blinds,
        cancelled: false,
        players: (stored?.holeCards ?? []).map((item) => ({
          playerId: item.playerId,
          nickname: byPlayer.get(item.playerId)?.nickname ?? '알 수 없음',
          seat: item.seat,
          cards: item.cards,
          startStack: item.startStack ?? null,
        })),
        board: stored?.board ?? [],
        actions: [],
        streets: [],
        awards: [],
      }
      result.push(current)
      pot = 0
      openTurn.clear()
      continue
    }
    if (!current) continue

    switch (event.type) {
      case 'blind-posted':
        pot += event.amount
        current.actions.push({
          seq: event.seq,
          street: 'preflop',
          playerId: event.playerId,
          kind: 'blind',
          amount: event.amount,
          to: event.amount,
          allIn: event.allIn,
          timedOut: false,
          pot,
          sessionTimeMs: event.sessionTimeMs,
          thinkMs: null,
          turnSeq: null,
          audio: { status: 'none', durationMs: null },
        })
        break
      case 'turn-started':
        openTurn.set(event.playerId, { seq: event.seq, time: event.sessionTimeMs })
        break
      case 'action': {
        pot += event.amount
        const turn = openTurn.get(event.playerId)
        openTurn.delete(event.playerId)
        const audio = turn ? turnStatus(byTurn.get(turn.seq), byPlayer.get(event.playerId)) : { status: 'none' as const, durationMs: null }
        current.actions.push({
          seq: event.seq,
          street: event.street,
          playerId: event.playerId,
          kind: event.action,
          amount: event.amount,
          to: event.to,
          allIn: event.allIn,
          timedOut: event.timedOut,
          pot,
          sessionTimeMs: event.sessionTimeMs,
          thinkMs: turn ? event.sessionTimeMs - turn.time : null,
          turnSeq: turn?.seq ?? null,
          audio,
        })
        break
      }
      case 'street-dealt':
        current.streets.push({ street: event.street, seq: event.seq })
        break
      case 'pot-awarded':
        current.awards.push({
          amount: event.award.amount,
          winners: event.award.winners,
          handName: event.award.handName ?? null,
        })
        break
      case 'hand-cancelled':
        current.cancelled = true
        break
      default:
        break
    }
  }

  return {
    session: {
      id: session.id,
      name: session.name,
      settings: session.settings,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      summary: session.summary,
    },
    participants: participants.map((participant) => ({
      playerId: participant.playerId,
      nickname: participant.nickname,
      voiceless: participant.voiceless,
    })),
    hands: result,
  }
}
