import { Play20Filled, ShieldCheckmark20Regular } from '@fluentui/react-icons'
import { formatChips, formatSignedChips } from '../../shared/format'
import { AudioTrackStatus } from './components/AudioTrackStatus'
import { HERO_ID, sessionSummary } from './fixtures'
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

  return (
    <div className="summary-screen">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
        <div className="summary-header">
          <p className="prep-eyebrow">세션 종료</p>
          <h1>{sessionSummary.roomName}</h1>
          <p className="summary-meta">
            {formatDuration(sessionSummary.durationMinutes)} · 핸드 {sessionSummary.handCount}개 · 시작 칩{' '}
            <span className="numeric">{formatChips(sessionSummary.startingStack)}</span>
          </p>
        </div>
      </header>

      <main className="summary-main">
        <section aria-labelledby="summary-results-title" className="replay-card summary-results">
          <div className="replay-card-header">
            <h2 id="summary-results-title">최종 결과</h2>
            <span className="prep-caption">가상 칩 기준</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">참가자</th>
                <th scope="col">최종 칩</th>
                <th scope="col">증감</th>
              </tr>
            </thead>
            <tbody>
              {sessionSummary.results.map((result, index) => (
                <tr className={result.playerId === HERO_ID ? 'is-self' : ''} key={result.playerId}>
                  <td className="numeric">{index + 1}</td>
                  <th scope="row">{result.name}</th>
                  <td className="numeric">{formatChips(result.finalStack)}</td>
                  <td className={`numeric delta ${result.delta >= 0 ? 'is-up' : 'is-down'}`}>
                    {formatSignedChips(result.delta)}
                    <span className="visually-hidden">{result.delta >= 0 ? ' 이익' : ' 손실'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="summary-side">
          <section aria-labelledby="self-recording-title" className="replay-card">
            <div className="replay-card-header">
              <h2 id="self-recording-title">내 음성 기록</h2>
              <span className="prep-caption">나에게만 표시</span>
            </div>
            <p className="self-recording-total">
              내 차례 <strong className="numeric">{selfRecording.turns}</strong>회
            </p>
            <ul className="self-recording-list">
              <li>
                <AudioTrackStatus status="voice" />
                <span className="numeric">{selfRecording.saved}</span>
              </li>
              <li>
                <AudioTrackStatus status="silent" />
                <span className="numeric">{selfRecording.silent}</span>
              </li>
              <li>
                <AudioTrackStatus status="failed" />
                <span className="numeric">{selfRecording.failed}</span>
              </li>
              <li>
                <AudioTrackStatus status="missing" />
                <span className="numeric">{selfRecording.missing}</span>
              </li>
            </ul>
            <p className="notice-inline">
              <ShieldCheckmark20Regular aria-hidden="true" />
              업로드가 모두 끝났습니다. 실패·누락된 차례는 복기에서 빈 칸으로 표시됩니다.
            </p>
          </section>

          <section aria-labelledby="summary-hands-title" className="replay-card">
            <div className="replay-card-header">
              <h2 id="summary-hands-title">복기할 핸드</h2>
            </div>
            <ul className="summary-hands">
              {sessionSummary.hands.map((hand) => (
                <li key={hand.number}>
                  <button onClick={() => onOpenReplay(hand.number)} type="button">
                    <strong className="numeric">#{hand.number}</strong>
                    <span>
                      {hand.winner} {formatSignedChips(hand.delta)} · {hand.note}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="summary-actions">
        <button className="btn btn--secondary" onClick={onExit} type="button">
          처음 화면으로
        </button>
        <button className="btn btn--primary" onClick={() => onOpenReplay(latestHand.number)} type="button">
          <Play20Filled aria-hidden="true" />
          복기 시작 · 핸드 #{latestHand.number}
        </button>
      </footer>
    </div>
  )
}
