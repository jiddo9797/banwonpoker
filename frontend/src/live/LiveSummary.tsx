import { Info20Regular, Play20Filled } from '@fluentui/react-icons'
import type { ClientState } from '@banwonpoker/server/protocol'
import { SummaryHeading, SummaryResults } from '../features/replay/components/SummaryParts'
import type { SummaryRow } from '../features/replay/components/SummaryParts'
import { formatChips } from '../shared/format'
import { TopBar } from '../shared/TopBar'
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
  const rows: SummaryRow[] = (summary?.results ?? []).map((result) => ({
    playerId: result.playerId,
    place: result.place,
    name: result.nickname,
    isSelf: result.playerId === state.you.playerId,
    finalStack: result.finalStack,
    delta: result.delta,
    eliminatedAtHand: result.eliminatedAtHand,
    avatarIndex: state.room.participants.find((participant) => participant.id === result.playerId)?.seat ?? result.place - 1,
  }))

  return (
    <div className="summary-screen">
      <TopBar title={state.room.name} />

      <main className="summary-main">
        <SummaryHeading
          actions={
            <>
              <button className={onReplay ? 'btn btn--outline btn--lg' : 'btn btn--primary btn--lg'} onClick={onExit} type="button">
                처음 화면으로
              </button>
              {onReplay ? (
                <button className="btn btn--primary btn--lg btn--raised" onClick={onReplay} type="button">
                  <Play20Filled aria-hidden="true" />
                  복기 보기
                </button>
              ) : null}
            </>
          }
          eyebrow={`세션 종료 · ${summary?.reason === 'last-player' ? '한 명이 남았습니다' : '방장이 끝냈습니다'}`}
          pills={[
            ...(summary ? [formatDuration(summary.durationMs), `핸드 ${summary.handsPlayed}개`] : []),
            <>
              시작 칩 <span className="numeric">{formatChips(state.room.settings.startingStack)}</span>
            </>,
          ]}
          title={state.room.name}
        />

        <div className="summary-grid">
          <SummaryResults rows={rows} titleId="live-results-title" />

          <div className="summary-side">
            <section aria-labelledby="live-replay-title" className="replay-card">
              <div className="replay-card-header">
                <h2 id="live-replay-title">복기</h2>
              </div>
              <p className="summary-footnote summary-footnote--icon">
                <Info20Regular aria-hidden="true" />
                {onReplay
                  ? '모든 참가자의 패와 차례별 음성을 액션 단위로 다시 볼 수 있습니다. 이 브라우저의 첫 화면에서도 다시 열 수 있습니다.'
                  : '이 서버는 기록을 저장하지 않아 복기할 수 없습니다.'}
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
