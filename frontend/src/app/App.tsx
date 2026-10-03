import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ConsentScreen } from '../features/lobby/ConsentScreen'
import { CreateRoomScreen } from '../features/lobby/CreateRoomScreen'
import { EntryScreen } from '../features/lobby/EntryScreen'
import { LobbyScreen } from '../features/lobby/LobbyScreen'
import { MicCheckScreen, micStatusLabel } from '../features/lobby/MicCheckScreen'
import type { PrepContext } from '../features/lobby/PrepLayout'
import { SeatScreen } from '../features/lobby/SeatScreen'
import { ReplayScreen } from '../features/replay/ReplayScreen'
import { SessionSummaryScreen } from '../features/replay/SessionSummaryScreen'
import { TablePrototype } from '../features/table/TablePrototype'
import { LiveApp } from '../live/LiveApp'
import { CanvasStage } from '../shared/CanvasStage'
import { createInitialFlowState, flowReducer, hostNameOf } from './flow'
import type { FlowAction, FlowState } from './flow'
import { buildFlowSearch } from './url'

// 개발 도구는 개발 서버나 VITE_DEVTOOLS=true 빌드에서만 번들에 포함된다.
const DEVTOOLS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEVTOOLS === 'true'
const DevToolbar = DEVTOOLS_ENABLED ? lazy(() => import('../dev/DevToolbar')) : null

function readSearchParams() {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
}

function ScreenRouter({ state, dispatch }: { state: FlowState; dispatch: (action: FlowAction) => void }) {
  const finishMicCheck = useCallback(() => dispatch({ type: 'mic.checkFinished' }), [dispatch])
  const startGame = useCallback(() => dispatch({ type: 'game.started' }), [dispatch])
  const leaveTable = () => dispatch({ type: 'table.left' })
  const context: PrepContext = { role: state.role, room: state.room, hostName: hostNameOf(state) }

  switch (state.screen) {
    case 'create':
      return (
        <CreateRoomScreen
          initialNickname={state.nickname}
          initialSettings={state.room}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'entry' })}
          onCreate={(nickname, settings) => dispatch({ type: 'room.created', nickname, settings })}
        />
      )

    case 'entry':
      return (
        <EntryScreen
          context={{ ...context, role: 'guest', hostName: hostNameOf({ role: 'guest', nickname: '' }) }}
          initialNickname={state.nickname}
          onCreateRoom={() => dispatch({ type: 'screen.changed', screen: 'create' })}
          onSubmit={(nickname) => dispatch({ type: 'entry.submitted', nickname })}
        />
      )

    case 'seat':
      return (
        <SeatScreen
          context={context}
          initialSeat={state.seatNumber}
          nickname={state.nickname}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'entry' })}
          onSelect={(seatNumber) => dispatch({ type: 'seat.selected', seatNumber })}
        />
      )

    case 'consent':
      return (
        <ConsentScreen
          consent={state.consent}
          context={context}
          nickname={state.nickname}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'seat' })}
          onChange={(key, value) => dispatch({ type: 'consent.changed', key, value })}
          onNext={() => dispatch({ type: 'screen.changed', screen: 'mic' })}
          seatNumber={state.seatNumber}
        />
      )

    case 'mic':
      return (
        <MicCheckScreen
          consent={state.consent}
          context={context}
          micStatus={state.micStatus}
          nickname={state.nickname}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'consent' })}
          onCheckFinished={finishMicCheck}
          onReady={() => dispatch({ type: 'ready.confirmed' })}
          onStartCheck={() => dispatch({ type: 'mic.checkStarted' })}
          onVoicelessChange={(voiceless) => dispatch({ type: 'mic.voicelessChanged', voiceless })}
          seatNumber={state.seatNumber}
          voiceless={state.voiceless}
        />
      )

    case 'lobby':
      return (
        <LobbyScreen
          context={context}
          nickname={state.nickname}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'mic' })}
          onSettingsChange={(settings) => dispatch({ type: 'room.settingsChanged', settings })}
          onStart={startGame}
          seatNumber={state.seatNumber}
          selfMicLabel={micStatusLabel(state.micStatus, state.voiceless)}
        />
      )

    case 'table':
      return (
        <TablePrototype
          hostName={hostNameOf(state)}
          isHost={state.role === 'host'}
          onEndSession={() => dispatch({ type: 'session.ended' })}
          onLeave={leaveTable}
          room={state.room}
          onVoicelessChange={(voiceless) => dispatch({ type: 'mic.voicelessChanged', voiceless })}
          scenarioKey={state.scenarioKey}
          voiceless={state.voiceless}
        />
      )

    case 'summary':
      return (
        <SessionSummaryScreen
          onExit={leaveTable}
          onOpenReplay={(handNumber) => dispatch({ type: 'replay.opened', handNumber })}
        />
      )

    case 'replay':
      return (
        <ReplayScreen
          exportOutcome={state.exportOutcome}
          initialExportStatus={state.replayEntry?.exportStatus}
          initialHandNumber={state.replayHandNumber}
          initialIndex={state.replayEntry?.index}
          // 핸드가 바뀌면 재생 상태를 새로 만든다.
          key={state.replayHandNumber}
          onBack={() => dispatch({ type: 'screen.changed', screen: 'summary' })}
        />
      )
  }
}

/** 목업 파라미터(?screen=, ?scenario=, ?prototype)가 있으면 클릭 프로토타입, 없으면 실제 서버에 연결한다. */
export function isPrototypeUrl(search: string) {
  const params = new URLSearchParams(search)
  return params.has('screen') || params.has('scenario') || params.has('prototype')
}

export function App() {
  const [prototype] = useState(() => isPrototypeUrl(typeof window === 'undefined' ? '' : window.location.search))
  return prototype ? <PrototypeApp /> : <LiveApp />
}

/** 목 데이터로 움직이는 클릭 프로토타입. 화면 검토와 시각 회귀 테스트에 쓴다. */
export function PrototypeApp() {
  const [state, dispatch] = useReducer(flowReducer, undefined, () => createInitialFlowState(readSearchParams()))
  const showDevTools = DevToolbar !== null && readSearchParams().get('devtools') !== '0'

  useEffect(() => {
    const url = new URL(window.location.href)
    const search = buildFlowSearch(state, url.searchParams)
    if (url.search === search) return
    window.history.replaceState(null, '', `${url.pathname}${search}${url.hash}`)
  }, [state])

  useEffect(() => {
    const titles: Record<FlowState['screen'], string> = {
      create: '방 만들기',
      entry: '입장',
      seat: '좌석 선택',
      consent: '녹음·패 공개 동의',
      mic: '마이크 점검',
      lobby: '대기실',
      table: '테이블',
      summary: '세션 요약',
      replay: '복기',
    }
    document.title = `banwonpoker · ${titles[state.screen]}`
  }, [state.screen])

  // 화면이 바뀌면 사라진 버튼 대신 새 화면의 제목으로 포커스를 옮겨 스크린 리더가 전환을 알 수 있게 한다.
  const previousScreenRef = useRef(state.screen)
  useEffect(() => {
    if (previousScreenRef.current === state.screen) return
    previousScreenRef.current = state.screen
    const heading = document.querySelector<HTMLElement>('[data-testid="canvas"] h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [state.screen])

  return (
    <>
      <CanvasStage>
        <ScreenRouter dispatch={dispatch} state={state} />
      </CanvasStage>
      {showDevTools && DevToolbar ? (
        <Suspense fallback={null}>
          <DevToolbar dispatch={dispatch} state={state} />
        </Suspense>
      ) : null}
    </>
  )
}
