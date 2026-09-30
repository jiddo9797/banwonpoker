import { useEffect, useRef, useState } from 'react'
import type { ClientState } from '@banwonpoker/server/protocol'
import type { RecordingState } from '../features/table/model'
import { createApi } from './api'
import type { Api } from './api'
import type { LiveClient } from './client'
import { TurnRecorder } from './recorder'
import type { RecorderStatus } from './recorder'

interface Options {
  client: LiveClient
  state: ClientState
  clockOffset: number
  pending: boolean
  api?: Api
  createRecorder?: (deps: ConstructorParameters<typeof TurnRecorder>[0]) => TurnRecorder
}

/**
 * 내 차례가 시작되면 녹음을 켜고, 액션을 보내면 멈추고, 차례가 끝나면 올린 뒤 마이크를 끈다.
 * `음성 없이 참여`면 아무것도 하지 않는다. 돌려주는 값은 내 좌석 아래 기록 상태 칩에 쓴다.
 */
export function useTurnRecording({ client, state, clockOffset, pending, api, createRecorder }: Options): RecordingState {
  const latest = useRef({ state, clockOffset })
  latest.current = { state, clockOffset }
  const [status, setStatus] = useState<{ status: RecorderStatus; retrying: boolean }>({ status: 'idle', retrying: false })
  const recorderRef = useRef<TurnRecorder | null>(null)

  if (!recorderRef.current) {
    const http = api ?? createApi()
    const session = () => {
      const sessionId = latest.current.state.room.sessionId
      const token = client.savedSession?.token
      if (!sessionId || !token) throw new Error('세션 정보가 없습니다.')
      return { sessionId, token }
    }
    const deps: ConstructorParameters<typeof TurnRecorder>[0] = {
      sink: {
        uploadChunk: (turnSeq, index, chunk) => {
          const { sessionId, token } = session()
          return http.uploadChunk(sessionId, turnSeq, index, chunk, token)
        },
        completeTurn: (turnSeq, report) => {
          const { sessionId, token } = session()
          return http.completeTurn(sessionId, turnSeq, report, token)
        },
      },
      sessionNow: () => Date.now() + latest.current.clockOffset - (latest.current.state.game?.startedAt ?? 0),
      onStatus: (next, detail) => setStatus({ status: next, retrying: detail.retrying }),
    }
    recorderRef.current = createRecorder ? createRecorder(deps) : new TurnRecorder(deps)
  }
  const recorder = recorderRef.current

  const turn = state.game?.turn
  const isMyTurn = state.room.phase === 'playing' && turn?.playerId === state.you.playerId
  const myTurnSeq = isMyTurn && turn && !state.you.voiceless ? turn.turnSeq : null

  useEffect(() => {
    if (myTurnSeq === null) void recorder.stop()
    else void recorder.start(myTurnSeq)
  }, [recorder, myTurnSeq])

  // 액션을 누르면 바로 멈추고, 서버가 거절해 차례가 이어지면 다시 녹음한다.
  useEffect(() => {
    if (myTurnSeq === null) return
    if (pending) recorder.pause()
    else recorder.resume()
  }, [recorder, pending, myTurnSeq])

  useEffect(() => () => void recorder.stop(), [recorder])

  if (!isMyTurn) return 'hidden'
  if (pending) return 'processing'
  // 음성 없이 참여: 화면에서는 `음성 없이 참여 중` 칩으로 바뀐다.
  if (myTurnSeq === null) return 'recording'
  if (status.status === 'failed' || status.retrying) return 'failed'
  return 'recording'
}
