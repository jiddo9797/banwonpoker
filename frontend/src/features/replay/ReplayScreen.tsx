import { ArrowDownload20Regular, ArrowLeft20Regular, ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons'
import { useEffect, useReducer, useState } from 'react'
import type { ExportOutcome } from '../../app/flow'
import { formatChips } from '../../shared/format'
import { AudioTrackStatus, audioStatusDescription, audioStatusOrder } from './components/AudioTrackStatus'
import { ExportModal } from './components/ExportModal'
import { ParticipantMixer } from './components/ParticipantMixer'
import { ReplayControls } from './components/ReplayControls'
import { ReplayTable } from './components/ReplayTable'
import { ReplayTimeline } from './components/ReplayTimeline'
import { replayHands, sessionSummary, streetLabels } from './fixtures'
import type { ExportScope, ExportStatus, HandAction, MixerChannel, ReplayHand } from './model'
import { createInitialReplayState, handOf, replayReducer } from './reducer'
import './replay.css'

export const PLAYBACK_STEP_MS = 1600
/** 음성을 다 들은 뒤 다음 칸으로 넘어가기 전 쉬는 시간 */
export const AFTER_AUDIO_MS = 500
export const EXPORT_TICK_MS = 250
const EXPORT_STEP = 10
const EXPORT_FAILURE_AT = 60

/** 실제 게임: 차례 음성을 재생한다. 음성이 없는 칸이면 undefined를 돌려준다. */
export interface ReplayAudioPlayer {
  play(action: HandAction, options: { channel: MixerChannel | undefined; speed: number; signal: AbortSignal }): Promise<void> | undefined
}

export interface ExportFile {
  name: string
  url: string
  sizeLabel: string
}

/** 실제 게임: 음성과 기록 파일을 만든다. */
export interface ReplayExporter {
  run(options: {
    scope: ExportScope
    hand: ReplayHand
    hands: ReplayHand[]
    mixer: Record<string, MixerChannel>
    onProgress: (progress: number) => void
    signal: AbortSignal
  }): Promise<ExportFile[]>
}

interface ReplayScreenProps {
  initialHandNumber?: number
  initialIndex?: number
  initialExportStatus?: ExportStatus
  /** 목 데이터에서만 쓴다: 다음 내보내기를 성공·실패 중 무엇으로 끝낼지 */
  exportOutcome?: ExportOutcome
  onBack: () => void
  /** 실제 게임의 핸드들. 없으면 목 데이터 */
  hands?: ReplayHand[]
  audio?: ReplayAudioPlayer
  exporter?: ReplayExporter
  /** 내보내기 창의 `세션 전체` 설명 */
  sessionInfo?: { handCount: number; durationMinutes: number }
  backLabel?: string
}

export function ReplayScreen({
  initialHandNumber,
  initialIndex,
  initialExportStatus,
  exportOutcome = 'success',
  onBack,
  hands = replayHands,
  audio,
  exporter,
  sessionInfo = { handCount: sessionSummary.handCount, durationMinutes: sessionSummary.durationMinutes },
  backLabel = '세션 요약',
}: ReplayScreenProps) {
  const [state, dispatch] = useReducer(
    replayReducer,
    { hands, handNumber: initialHandNumber, index: initialIndex, exportStatus: initialExportStatus },
    createInitialReplayState,
  )
  const [exportFiles, setExportFiles] = useState<ExportFile[]>()
  const [exportError, setExportError] = useState<string>()
  const hand = handOf(state.hands, state.handNumber)
  const current = hand.actions[state.index]
  const actor = hand.players.find((player) => player.id === current.playerId)
  const handPosition = state.hands.findIndex((item) => item.number === hand.number)
  const previousHand = state.hands[handPosition - 1]
  const nextHand = state.hands[handPosition + 1]

  // 재생: 음성이 있으면 끝까지 듣고, 없으면 정해진 간격 뒤 다음 칸으로 간다.
  useEffect(() => {
    if (!state.playing) return
    const controller = new AbortController()
    let timer: number | undefined
    const next = (delay: number) => {
      timer = window.setTimeout(() => dispatch({ type: 'playback.ticked' }), delay / state.speed)
    }
    const playing = audio?.play(current, { channel: current.playerId ? state.mixer[current.playerId] : undefined, speed: state.speed, signal: controller.signal })
    if (playing) {
      playing.then(
        () => !controller.signal.aborted && next(AFTER_AUDIO_MS),
        () => !controller.signal.aborted && next(PLAYBACK_STEP_MS),
      )
    } else {
      next(PLAYBACK_STEP_MS)
    }
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
    // 음량을 바꿀 때마다 처음부터 다시 틀지 않도록 mixer는 의존성에서 뺀다.
  }, [state.playing, state.index, state.speed, state.handNumber, audio])

  // 실제 내보내기
  useEffect(() => {
    if (!exporter || state.exportStatus !== 'generating') return
    const controller = new AbortController()
    setExportFiles(undefined)
    setExportError(undefined)
    exporter
      .run({
        scope: state.exportScope,
        hand,
        hands: state.hands,
        mixer: state.mixer,
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'export.progressed', progress: Math.round(progress) }),
      })
      .then(
        (files) => {
          if (controller.signal.aborted) return
          setExportFiles(files)
          dispatch({ type: 'export.completed' })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          setExportError(error instanceof Error ? error.message : '영상을 만들지 못했습니다.')
          dispatch({ type: 'export.failed' })
        },
      )
    return () => controller.abort()
    // 생성을 시작할 때 한 번만 돈다.
  }, [exporter, state.exportStatus])

  // 목 데이터 내보내기: 진행률만 흉내 낸다.
  useEffect(() => {
    if (exporter || state.exportStatus !== 'generating') return
    const timer = window.setTimeout(() => {
      if (exportOutcome === 'failure' && state.exportProgress >= EXPORT_FAILURE_AT) dispatch({ type: 'export.failed' })
      else if (state.exportProgress >= 100) dispatch({ type: 'export.completed' })
      else dispatch({ type: 'export.progressed', progress: state.exportProgress + EXPORT_STEP })
    }, EXPORT_TICK_MS)
    return () => window.clearTimeout(timer)
  }, [exporter, state.exportStatus, state.exportProgress, exportOutcome])

  const mutedNames = hand.players.filter((player) => state.mixer[player.id]?.muted).map((player) => player.name)

  return (
    <div className="replay-screen">
      <header className="replay-header">
        <button className="btn btn--secondary" onClick={onBack} type="button">
          <ArrowLeft20Regular aria-hidden="true" />
          {backLabel}
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
        errorMessage={exportError}
        files={exporter ? exportFiles : undefined}
        handNumber={hand.number}
        sessionInfo={sessionInfo}
        variant={exporter ? 'audio' : 'video'}
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
