import { ChevronRight20Regular, ErrorCircle20Regular, Play20Filled, Warning20Filled } from '@fluentui/react-icons'
import { formatChips, formatSignedChips } from '../../shared/format'
import { TopBar } from '../../shared/TopBar'
import { SummaryHeading, SummaryResults } from './components/SummaryParts'
import type { SummaryRow } from './components/SummaryParts'
import { HERO_ID, replayHands, sessionSummary } from './fixtures'
import './replay.css'

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}시간 ${rest}분` : `${rest}분`
}

interface SessionSummaryScreenProps {
  onOpenReplay: (handNumber: number) => void
  onExit: () => void
}

export function SessionSummaryScreen({ onOpenReplay, onExit }: SessionSummaryScreenProps) {
  const { selfRecording } = sessionSummary
  const latestHand = sessionSummary.hands[0]
  // 아바타 색은 복기 테이블과 같은 좌석 순서를 쓴다.
  const seatOrder = replayHands[0]?.players.map((player) => player.id) ?? []
  const rows: SummaryRow[] = sessionSummary.results.map((result, index) => ({
    playerId: result.playerId,
    place: index + 1,
    name: result.name,
    isSelf: result.playerId === HERO_ID,
    finalStack: result.finalStack,
    delta: result.delta,
    eliminatedAtHand: result.eliminatedAtHand,
    avatarIndex: Math.max(0, seatOrder.indexOf(result.playerId)),
  }))
  const recordingParts = [
    { key: 'voice', count: selfRecording.saved },
    { key: 'silent', count: selfRecording.silent },
    { key: 'failed', count: selfRecording.failed },
    { key: 'missing', count: selfRecording.missing },
  ]

  return (
    <div className="summary-screen">
      <TopBar title={sessionSummary.roomName} />

      <main className="summary-main">
        <SummaryHeading
          actions={
            <>
              <button className="btn btn--outline btn--lg" onClick={onExit} type="button">
                처음 화면으로
              </button>
              <button className="btn btn--primary btn--lg btn--raised" onClick={() => onOpenReplay(latestHand.number)} type="button">
                <Play20Filled aria-hidden="true" />
                복기 시작 · 핸드 #{latestHand.number}
              </button>
            </>
          }
          eyebrow="세션 종료"
          pills={[
            formatDuration(sessionSummary.durationMinutes),
            `핸드 ${sessionSummary.handCount}개`,
            <>
              시작 칩 <span className="numeric">{formatChips(sessionSummary.startingStack)}</span>
            </>,
          ]}
          title={sessionSummary.roomName}
        />

        <div className="summary-grid">
          <SummaryResults rows={rows} titleId="summary-results-title" />

          <div className="summary-side">
            <section aria-labelledby="self-recording-title" className="replay-card self-recording">
              <div className="replay-card-header">
                <h2 id="self-recording-title">내 음성 기록</h2>
                <span className="prep-caption">나에게만 표시</span>
              </div>
              <p className="self-recording-total">
                <strong className="numeric">{selfRecording.turns}</strong> 번의 차례
              </p>
              <div aria-hidden="true" className="self-recording-bar">
                {recordingParts
                  .filter((part) => part.count > 0)
                  .map((part) => (
                    <span className={`is-${part.key}`} key={part.key} style={{ flexGrow: part.count }} />
                  ))}
              </div>
              <ul className="self-recording-list">
                <li>
                  <span>음성</span>
                  <b className="numeric">{selfRecording.saved}</b>
                </li>
                <li>
                  <span>무발언</span>
                  <b className="numeric">{selfRecording.silent}</b>
                </li>
                <li className="is-warning">
                  <span>
                    <Warning20Filled aria-hidden="true" />
                    기록 실패
                  </span>
                  <b className="numeric">{selfRecording.failed}</b>
                </li>
                <li className="is-warning">
                  <span>
                    <ErrorCircle20Regular aria-hidden="true" />
                    누락
                  </span>
                  <b className="numeric">{selfRecording.missing}</b>
                </li>
              </ul>
              <p className="summary-footnote">업로드가 모두 끝났습니다. 실패·누락된 차례는 복기에서 빈 칸으로 표시됩니다.</p>
            </section>

            <section aria-labelledby="summary-hands-title" className="replay-card">
              <div className="replay-card-header">
                <h2 id="summary-hands-title">복기할 핸드</h2>
              </div>
              <ul className="summary-hands">
                {sessionSummary.hands.map((hand, index) => (
                  <li key={hand.number}>
                    <button className={index === 0 ? 'is-first' : undefined} onClick={() => onOpenReplay(hand.number)} type="button">
                      <strong className="numeric">#{hand.number}</strong>
                      <span>
                        {hand.winner} {formatSignedChips(hand.delta)} · {hand.note}
                      </span>
                      <ChevronRight20Regular aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
