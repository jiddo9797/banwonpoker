import { useEffect, useRef } from 'react'
import type { ClientState } from '@banwonpoker/server/protocol'
import { CanvasStage } from '../shared/CanvasStage'
import type { LiveClient } from './client'
import { getLiveClient, useLiveSnapshot } from './hooks'
import { LiveHome, Reconnecting, Replaced } from './LiveHome'
import { LivePrep } from './LivePrep'
import { LiveSummary } from './LiveSummary'
import { LiveTable } from './LiveTable'

type LiveScreen = 'home' | 'reconnecting' | 'replaced' | 'prep' | 'table' | 'summary'

const titles: Record<LiveScreen, string> = {
  home: '시작',
  reconnecting: '다시 연결 중',
  replaced: '다른 탭에서 사용 중',
  prep: '게임 준비',
  table: '테이블',
  summary: '세션 요약',
}

function screenOf(state: ClientState | null, resuming: boolean, replaced: boolean): LiveScreen {
  if (replaced) return 'replaced'
  if (!state) return resuming ? 'reconnecting' : 'home'
  if (state.room.phase === 'ended') return 'summary'
  const me = state.room.participants.find((participant) => participant.id === state.you.playerId)
  if (state.game && me && (me.status === 'playing' || me.status === 'waiting' || me.status === 'eliminated')) return 'table'
  return 'prep'
}

function roomFromUrl() {
  const code = new URLSearchParams(window.location.search).get('room')
  return code ? code.replace(/[\s-]/g, '').toUpperCase() : undefined
}

/** 실제 게임 서버에 연결되는 앱. 주소창에 목업용 파라미터가 없으면 이 앱이 열린다. */
export function LiveApp({ client = getLiveClient() }: { client?: LiveClient }) {
  const snapshot = useLiveSnapshot(client)
  const invitedRoom = useRef(roomFromUrl())
  const screen = screenOf(snapshot.state, snapshot.resuming, snapshot.replaced)

  // 저장한 방이 있으면 다시 들어간다. 초대 링크가 다른 방이면 새 방 입장을 우선한다.
  useEffect(() => {
    const saved = client.savedSession
    if (!saved || snapshot.state || snapshot.resuming) return
    if (invitedRoom.current && invitedRoom.current !== saved.roomCode) return
    client.resumeSaved()
    // 처음 한 번만 시도한다.
  }, [client])

  // 방에 들어가 있으면 주소에 방 코드를 남겨 새로고침·공유에 쓴다.
  const roomCode = snapshot.state?.room.code
  useEffect(() => {
    const url = new URL(window.location.href)
    if (roomCode) url.searchParams.set('room', roomCode)
    else if (screen === 'home' && !invitedRoom.current) url.searchParams.delete('room')
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [roomCode, screen])

  // 화면이 바뀌면 새 화면 제목으로 포커스를 옮긴다.
  const previous = useRef(screen)
  useEffect(() => {
    document.title = `banwonpoker · ${titles[screen]}`
    if (previous.current === screen) return
    previous.current = screen
    const heading = document.querySelector<HTMLElement>('[data-testid="canvas"] h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [screen])

  const leave = () => {
    invitedRoom.current = undefined
    client.leave()
  }

  return (
    <CanvasStage>
      {screen === 'home' ? <LiveHome client={client} initialRoomCode={invitedRoom.current} snapshot={snapshot} /> : null}
      {screen === 'reconnecting' ? <Reconnecting /> : null}
      {screen === 'replaced' ? <Replaced onLeave={leave} onResume={() => client.resumeSaved()} /> : null}
      {screen === 'prep' && snapshot.state ? (
        <LivePrep client={client} key={snapshot.state.room.code} lastError={snapshot.lastError} state={snapshot.state} />
      ) : null}
      {screen === 'table' && snapshot.state ? <LiveTable client={client} snapshot={snapshot} state={snapshot.state} /> : null}
      {screen === 'summary' && snapshot.state ? <LiveSummary onExit={leave} state={snapshot.state} /> : null}
    </CanvasStage>
  )
}
