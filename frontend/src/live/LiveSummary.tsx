import { Info20Regular, Play20Filled } from '@fluentui/react-icons'
import type { ClientState } from '@banwonpoker/server/protocol'
import { formatChips, formatSignedChips } from '../shared/format'
import '../features/replay/replay.css'

function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`
}

interface LiveSummaryProps {
  state: ClientState
  onExit: () => void
  /** 복기를 연다. 기록을 저장하지 않는 서버면 없다. */
  onReplay?: () => void
}

/** 실제 게임의 세션 요약 */
export function LiveSummary({ state, onExit, onReplay }: LiveSummaryProps) {
  const summary = state.room.summary
  const results = summary?.results ?? []

  return (
    <div className="summary-screen">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
        <div className="summary-header">
          <p className="prep-eyebrow">세션 종료 · {summary?.reason === 'last-player' ? '한 명이 남았습니다' : '방장이 끝냈습니다'}</p>
          <h1>{state.room.name}</h1>
          <p className="summary-meta">
            {summary ? `${formatDuration(summary.durationMs)} · 핸드 ${summary.handsPlayed}개` : ''} · 시작 칩{' '}
            <span className="numeric">{formatChips(state.room.settings.startingStack)}</span>
          </p>
        </div>
      </header>

      <main className="summary-main">
        <section aria-labelledby="live-results-title" className="replay-card summary-results">
          <div className="replay-card-header">
            <h2 id="live-results-title">최종 결과</h2>
            <span className="prep-caption">가상 칩 기준</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">참가자</th>
                <th scope="col">최종 칩</th>
                <th scope="col">증감</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr className={result.playerId === state.you.playerId ? 'is-self' : ''} key={result.playerId}>
                  <td className="numeric">{result.place}</td>
                  <th scope="row">
                    {result.nickname}
                    {result.playerId === state.you.playerId ? ' (나)' : ''}
                  </th>
                  <td className="numeric">{formatChips(result.finalStack)}</td>
                  <td className={`numeric delta ${result.delta >= 0 ? 'is-up' : 'is-down'}`}>
                    {formatSignedChips(result.delta)}
                    <span className="visually-hidden">{result.delta >= 0 ? ' 이익' : ' 손실'}</span>
                  </td>
                  <td className={result.eliminatedAtHand ? 'status-cell is-out' : 'status-cell'}>
                    {result.eliminatedAtHand ? `탈락 · 핸드 #${result.eliminatedAtHand}` : '끝까지 참여'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="summary-side">
          <section aria-labelledby="live-replay-title" className="replay-card">
            <div className="replay-card-header">
              <h2 id="live-replay-title">복기</h2>
            </div>
            <p className="notice-inline">
              <Info20Regular aria-hidden="true" />
              {onReplay
                ? '모든 참가자의 패와 차례별 음성을 액션 단위로 다시 볼 수 있습니다. 이 브라우저의 첫 화면에서도 다시 열 수 있습니다.'
                : '이 서버는 기록을 저장하지 않아 복기할 수 없습니다.'}
            </p>
          </section>
        </div>
      </main>

      <footer className="summary-actions">
        <button className={onReplay ? 'btn btn--secondary' : 'btn btn--primary'} onClick={onExit} type="button">
          처음 화면으로
        </button>
        {onReplay ? (
          <button className="btn btn--primary" onClick={onReplay} type="button">
            <Play20Filled aria-hidden="true" />
            복기 보기
          </button>
        ) : null}
      </footer>
    </div>
  )
}
