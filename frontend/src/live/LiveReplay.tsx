import { useEffect, useMemo, useState } from 'react'
import type { ReplayData } from '@banwonpoker/server/protocol'
import { ReplayScreen } from '../features/replay/ReplayScreen'
import { createApi } from './api'
import type { Api } from './api'
import type { PastSession } from './history'
import { toReplayHands } from './replayAdapt'
import { createAudioPlayer, createAudioSource, createExporter } from './replayMedia'
import './live.css'

interface LiveReplayProps {
  session: PastSession
  onBack: () => void
  backLabel: string
  api?: Api
}

/** 끝난 세션의 복기. 전체 패와 차례별 음성은 서버가 세션 참가자에게만 준다. */
export function LiveReplay({ session, onBack, backLabel, api }: LiveReplayProps) {
  const http = useMemo(() => api ?? createApi(), [api])
  const [replay, setReplay] = useState<ReplayData>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    http.fetchReplay(session.sessionId, session.token).then(
      (data) => !cancelled && setReplay(data),
      (reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : '복기를 불러오지 못했습니다.'),
    )
    return () => {
      cancelled = true
    }
  }, [http, session.sessionId, session.token])

  const media = useMemo(() => {
    const source = createAudioSource(http, session.sessionId, session.token)
    return { audio: createAudioPlayer(source), exporter: createExporter(source, session.name) }
  }, [http, session.sessionId, session.token, session.name])

  const hands = useMemo(() => (replay ? toReplayHands(replay, session.playerId) : []), [replay, session.playerId])

  if (!replay || hands.length === 0) {
    return (
      <div className="live-home">
        <header className="chrome-header">
          <div className="wordmark">banwonpoker</div>
        </header>
        <main aria-labelledby="replay-loading-title" className="live-home-main">
          <h1 id="replay-loading-title">{error ? '복기를 열 수 없습니다' : replay ? '복기할 핸드가 없습니다' : '복기를 불러오는 중…'}</h1>
          <p className="live-home-lead" role={error ? 'alert' : 'status'}>
            {error ?? (replay ? '이 세션에서는 핸드가 진행되지 않았습니다.' : `${session.name} 세션의 기록을 받고 있습니다.`)}
          </p>
          <div className="live-home-actions">
            <button className="btn btn--secondary" onClick={onBack} type="button">
              {backLabel}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // 도중에 끝내 무효가 된 핸드보다, 마지막으로 끝까지 진행된 핸드부터 연다.
  const lastPlayed = [...replay.hands].reverse().find((hand) => !hand.cancelled && hands.some((item) => item.number === hand.number))
  const durationMinutes = replay.session.endedAt ? Math.max(1, Math.round((replay.session.endedAt - replay.session.startedAt) / 60_000)) : 0

  return (
    <ReplayScreen
      audio={media.audio}
      backLabel={backLabel}
      exporter={media.exporter}
      hands={hands}
      initialHandNumber={lastPlayed?.number}
      onBack={onBack}
      sessionInfo={{ handCount: hands.length, durationMinutes }}
    />
  )
}
