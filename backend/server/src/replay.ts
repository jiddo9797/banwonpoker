import type { AudioStatus, ReplayData, ReplayHandData, TimedEvent } from './protocol'
import type { SessionRecord, StoredHand, StoredParticipant, StoredTurn } from './store'

/** 차례 하나의 음성 상태를 정한다. */
export function turnStatus(turn: StoredTurn | undefined): { status: AudioStatus; durationMs: number | null } {
  if (!turn) return { status: 'missing', durationMs: null }
  // 게임 중에 음성을 껐다 켤 수 있으므로 참가자 설정이 아니라 그 차례의 설정을 본다.
  if (turn.voiceless) return { status: 'voiceless', durationMs: null }
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
  /** 복기를 요청한 참가자가 표시한 핸드 */
  marked: number[] = [],
): ReplayData {
  const byPlayer = new Map(participants.map((participant) => [participant.playerId, participant]))
  const byTurn = new Map(turns.map((turn) => [turn.turnSeq, turn]))
  const storedHands = new Map(hands.map((hand) => [hand.handNumber, hand]))
  const result: ReplayHandData[] = []

  let current: ReplayHandData | null = null
  let pot = 0
  // 시작 칩을 저장하기 전의 기록도 복기에서 칩을 보여줄 수 있도록 이벤트로 칩을 따라간다.
  // 처음 보는 참가자는 시작 칩으로 시작한다(게임 중에 들어와도 시작 칩을 받는다).
  const stacks = new Map<string, number>()
  let handStart = new Map<string, number>()
  const openTurn = new Map<string, { seq: number; time: number }>()

  const spend = (playerId: string, amount: number) => {
    const stack = stacks.get(playerId)
    if (stack !== undefined) stacks.set(playerId, stack - amount)
  }

  for (const event of events) {
    if (event.type === 'hand-started') {
      const stored = storedHands.get(event.handNumber)
      current = {
        number: event.handNumber,
        dealerSeat: event.dealerSeat,
        blinds: event.blinds,
        cancelled: false,
        players: (stored?.holeCards ?? []).map((item) => {
          const startStack = item.startStack ?? stacks.get(item.playerId) ?? session.settings.startingStack
          stacks.set(item.playerId, startStack)
          return {
            playerId: item.playerId,
            nickname: byPlayer.get(item.playerId)?.nickname ?? '알 수 없음',
            seat: item.seat,
            cards: item.cards,
            startStack,
          }
        }),
        board: stored?.board ?? [],
        actions: [],
        streets: [],
        awards: [],
      }
      result.push(current)
      handStart = new Map(current.players.map((player) => [player.playerId, player.startStack as number]))
      pot = 0
      openTurn.clear()
      continue
    }
    if (!current) continue

    switch (event.type) {
      case 'blind-posted':
        pot += event.amount
        spend(event.playerId, event.amount)
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
        spend(event.playerId, event.amount)
        const turn = openTurn.get(event.playerId)
        openTurn.delete(event.playerId)
        const audio = turn ? turnStatus(byTurn.get(turn.seq)) : { status: 'none' as const, durationMs: null }
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
        for (const winner of event.award.winners) spend(winner.playerId, -winner.amount)
        current.awards.push({
          amount: event.award.amount,
          winners: event.award.winners,
          handName: event.award.handName ?? null,
        })
        break
      case 'hand-cancelled':
        current.cancelled = true
        // 무효 핸드는 낸 칩을 모두 돌려준다.
        for (const [playerId, start] of handStart) stacks.set(playerId, start)
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
    marked,
  }
}
