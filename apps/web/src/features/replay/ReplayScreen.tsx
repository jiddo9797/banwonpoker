import { ArrowDownload20Regular, ArrowLeft20Regular, ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons'
import { useEffect, useReducer } from 'react'
import type { ExportOutcome } from '../../app/flow'
import { formatChips } from '../../shared/format'
import { AudioTrackStatus, audioStatusDescription, audioStatusOrder } from './components/AudioTrackStatus'
import { ExportModal } from './components/ExportModal'
import { ParticipantMixer } from './components/ParticipantMixer'
import { ReplayControls } from './components/ReplayControls'
import { ReplayTable } from './components/ReplayTable'
import { ReplayTimeline } from './components/ReplayTimeline'
import { getReplayHand, replayHands, streetLabels } from './fixtures'
import type { ExportStatus } from './model'
import { createInitialReplayState, replayReducer } from './reducer'
import './replay.css'

export const PLAYBACK_STEP_MS = 1600
export const EXPORT_TICK_MS = 250
const EXPORT_STEP = 10
const EXPORT_FAILURE_AT = 60

interface ReplayScreenProps {
  initialHandNumber?: number
  initialIndex?: number
  initialExportStatus?: ExportStatus
  exportOutcome: ExportOutcome
  onBack: () => void
}

export function ReplayScreen({
  initialHandNumber,
  initialIndex,
  initialExportStatus,
  exportOutcome,
  onBack,
}: ReplayScreenProps) {
  const [state, dispatch] = useReducer(
    replayReducer,
    { handNumber: initialHandNumber, index: initialIndex, exportStatus: initialExportStatus },
    createInitialReplayState,
  )
  const hand = getReplayHand(state.handNumber)
  const current = hand.actions[state.index]
  const actor = hand.players.find((player) => player.id === current.playerId)
  const handPosition = replayHands.findIndex((item) => item.number === hand.number)
  const previousHand = replayHands[handPosition - 1]
  const nextHand = replayHands[handPosition + 1]

  useEffect(() => {
    if (!state.playing) return
    const timer = window.setTimeout(() => dispatch({ type: 'playback.ticked' }), PLAYBACK_STEP_MS / state.speed)
    return () => window.clearTimeout(timer)
  }, [state.playing, state.index, state.speed])

  useEffect(() => {
    if (state.exportStatus !== 'generating') return
    const timer = window.setTimeout(() => {
      if (exportOutcome === 'failure' && state.exportProgress >= EXPORT_FAILURE_AT) dispatch({ type: 'export.failed' })
      else if (state.exportProgress >= 100) dispatch({ type: 'export.completed' })
      else dispatch({ type: 'export.progressed', progress: state.exportProgress + EXPORT_STEP })
    }, EXPORT_TICK_MS)
    return () => window.clearTimeout(timer)
  }, [state.exportStatus, state.exportProgress, exportOutcome])

  const mutedNames = hand.players.filter((player) => state.mixer[player.id]?.muted).map((player) => player.name)

  return (
    <div className="replay-screen">
      <header className="replay-header">
        <button className="btn btn--secondary" onClick={onBack} type="button">
          <ArrowLeft20Regular aria-hidden="true" />
          세션 요약
        </button>
        <div className="replay-heading">
          <h1>복기 · 핸드 #{hand.number}</h1>
          <p>모든 참가자의 패와 차례별 음성이 공개됩니다.</p>
        </div>
        <nav aria-label="핸드 이동" className="hand-nav">
          <button
            aria-disabled={!previousHand}
            className="icon-button"
            onClick={() => {
              if (previousHand) dispatch({ type: 'hand.changed', handNumber: previousHand.number })
            }}
            type="button"
          >
            <ChevronLeft20Regular aria-hidden="true" />
            <span className="visually-hidden">이전 핸드</span>
          </button>
          <span className="numeric">#{hand.number}</span>
          <button
            aria-disabled={!nextHand}
            className="icon-button"
            onClick={() => {
              if (nextHand) dispatch({ type: 'hand.changed', handNumber: nextHand.number })
            }}
            type="button"
          >
            <ChevronRight20Regular aria-hidden="true" />
            <span className="visually-hidden">다음 핸드</span>
          </button>
        </nav>
        <button className="btn btn--primary" onClick={() => dispatch({ type: 'export.opened' })} type="button">
          <ArrowDownload20Regular aria-hidden="true" />
          영상 내보내기
        </button>
      </header>

      <main className="replay-main">
        <ReplayTable hand={hand} index={state.index} playing={state.playing} />

        <div className="replay-side">
          <section aria-labelledby="action-detail-title" className="replay-card action-detail">
            <div className="replay-card-header">
              <h2 id="action-detail-title">현재 액션</h2>
              <span className="prep-caption">
                {streetLabels[current.street]} · {state.index + 1}번째
              </span>
            </div>
            <p className="action-detail-main">
              <strong>{actor?.name ?? '결과'}</strong> {current.kind === 'result' ? hand.result : current.label}
            </p>
            <dl className="action-detail-facts">
              <div>
                <dt>생각 시간</dt>
                <dd>{current.thinkSeconds ? `${current.thinkSeconds}초` : '자동 처리'}</dd>
              </div>
              <div>
                <dt>팟</dt>
                <dd className="numeric">{formatChips(current.pot)}</dd>
              </div>
              <div>
                <dt>음성</dt>
                <dd>
                  <AudioTrackStatus seconds={current.audio.seconds} status={current.audio.status} />
                </dd>
              </div>
            </dl>
            <p className="action-detail-note">{audioStatusDescription(current.audio.status)}</p>
          </section>

          <ParticipantMixer
            hand={hand}
            mixer={state.mixer}
            onToggleMute={(playerId) => dispatch({ type: 'mixer.muteToggled', playerId })}
            onVolumeChange={(playerId, volume) => dispatch({ type: 'mixer.volumeChanged', playerId, volume })}
          />
        </div>

        <section aria-label="액션 단위 복기" className="replay-bottom">
          <ReplayControls
            index={state.index}
            onSpeedChange={(speed) => dispatch({ type: 'speed.changed', speed })}
            onStep={(delta) => dispatch({ type: 'playback.stepped', delta })}
            onTogglePlay={() => dispatch({ type: 'playback.toggled' })}
            playing={state.playing}
            speed={state.speed}
            street={current.street}
            total={hand.actions.length}
          />
          <ReplayTimeline
            hand={hand}
            index={state.index}
            onSelect={(index) => dispatch({ type: 'action.selected', index })}
          />
          <ul aria-label="음성 상태 범례" className="audio-legend">
            {audioStatusOrder.map((status) => (
              <li key={status}>
                <AudioTrackStatus status={status} />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <ExportModal
        handNumber={hand.number}
        mutedNames={mutedNames}
        onClose={() => dispatch({ type: 'export.closed' })}
        onScopeChange={(scope) => dispatch({ type: 'export.scopeChanged', scope })}
        onStart={() => dispatch({ type: 'export.started' })}
        progress={state.exportProgress}
        scope={state.exportScope}
        status={state.exportStatus}
      />
    </div>
  )
}
