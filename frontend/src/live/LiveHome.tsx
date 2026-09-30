import { Add20Regular, DoorArrowRight20Regular } from '@fluentui/react-icons'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CreateRoomScreen } from '../features/lobby/CreateRoomScreen'
import { defaultRoomSettings } from '../features/room/settings'
import type { LiveClient, LiveSnapshot } from './client'
import './live.css'

const NICKNAME_MIN = 2
const NICKNAME_MAX = 8

export function validateLiveNickname(value: string) {
  const length = value.trim().length
  if (length === 0) return '닉네임을 입력하세요.'
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 정하세요.`
  return undefined
}

function normalizeCode(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

interface LiveHomeProps {
  client: LiveClient
  snapshot: LiveSnapshot
  /** 초대 링크(?room=)로 들어왔을 때의 방 코드 */
  initialRoomCode?: string
}

export function LiveHome({ client, snapshot, initialRoomCode }: LiveHomeProps) {
  const [mode, setMode] = useState<'home' | 'create'>('home')
  const [waitingFor, setWaitingFor] = useState<'room.create' | 'room.join' | null>(null)
  const [code, setCode] = useState(initialRoomCode ?? '')
  const [nickname, setNickname] = useState('')
  const [formError, setFormError] = useState<string>()
  const codeId = useId()
  const nicknameId = useId()
  const errorId = useId()
  const nicknameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // 서버가 거절하면(없는 방, 같은 닉네임 등) 기다림을 풀고 이유를 보여준다.
  const error = snapshot.lastError
  const errorFor = (type: 'room.create' | 'room.join') => (error?.requestType === type ? error.error.message : undefined)
  const [seenError, setSeenError] = useState(error?.id)
  if (error?.id !== seenError) {
    setSeenError(error?.id)
    setWaitingFor(null)
  }

  useEffect(() => {
    if (initialRoomCode) nicknameRef.current?.focus()
  }, [initialRoomCode])

  if (mode === 'create') {
    return (
      <CreateRoomScreen
        busy={waitingFor === 'room.create'}
        errorMessage={errorFor('room.create')}
        initialSettings={defaultRoomSettings}
        onBack={() => setMode('home')}
        onCreate={(hostNickname, settings) => {
          client.dismissError()
          setWaitingFor('room.create')
          client.createRoom(hostNickname.trim(), settings)
        }}
        validateNickname={validateLiveNickname}
      />
    )
  }

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (waitingFor) return
    const roomCode = normalizeCode(code)
    if (roomCode.length !== 6) {
      setFormError('방 코드 6자리를 입력하세요.')
      codeRef.current?.focus()
      return
    }
    const nicknameError = validateLiveNickname(nickname)
    if (nicknameError) {
      setFormError(nicknameError)
      nicknameRef.current?.focus()
      return
    }
    setFormError(undefined)
    client.dismissError()
    setWaitingFor('room.join')
    client.joinRoom(roomCode, nickname.trim())
  }

  const joinError = formError ?? errorFor('room.join')

  return (
    <div className="live-home">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
      </header>
      <main aria-labelledby="live-home-title" className="live-home-main">
        <h1 id="live-home-title">친구들과 포커 한 판</h1>
        <p className="live-home-lead">방을 만들어 초대 링크를 보내거나, 받은 방 코드로 들어오세요.</p>

        <div className="live-home-grid">
          <section aria-labelledby="create-title" className="prep-panel live-home-card">
            <h2 id="create-title">새 방 만들기</h2>
            <p>방장이 되어 블라인드와 시작 칩을 정하고 친구를 초대합니다.</p>
            <button className="btn btn--primary" onClick={() => setMode('create')} type="button">
              <Add20Regular aria-hidden="true" />
              방 만들기
            </button>
          </section>

          <form aria-labelledby="join-title" className="prep-panel live-home-card" noValidate onSubmit={join}>
            <h2 id="join-title">초대받은 방에 입장</h2>
            <div className="field">
              <label htmlFor={codeId}>방 코드</label>
              <input
                aria-describedby={joinError ? errorId : undefined}
                autoCapitalize="characters"
                autoComplete="off"
                id={codeId}
                maxLength={9}
                onChange={(event) => setCode(event.target.value)}
                placeholder="예: ABC234"
                ref={codeRef}
                value={code}
              />
            </div>
            <div className="field">
              <label htmlFor={nicknameId}>닉네임</label>
              <input
                aria-describedby={joinError ? errorId : undefined}
                autoComplete="nickname"
                id={nicknameId}
                maxLength={NICKNAME_MAX + 4}
                onChange={(event) => setNickname(event.target.value)}
                ref={nicknameRef}
                value={nickname}
              />
            </div>
            {joinError ? (
              <p className="field-error" id={errorId} role="alert">
                {joinError}
              </p>
            ) : null}
            <button aria-disabled={waitingFor === 'room.join'} className="btn btn--secondary" type="submit">
              <DoorArrowRight20Regular aria-hidden="true" />
              {waitingFor === 'room.join' ? '들어가는 중…' : '입장하기'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

export function Replaced({ onResume, onLeave }: { onResume: () => void; onLeave: () => void }) {
  return (
    <div className="live-home">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
      </header>
      <main aria-labelledby="replaced-title" className="live-home-main">
        <h1 id="replaced-title">다른 탭에서 이 자리를 쓰고 있습니다</h1>
        <p className="live-home-lead">같은 브라우저나 다른 기기에서 같은 자리로 들어왔습니다. 한 자리는 한 화면에서만 쓸 수 있습니다.</p>
        <div className="live-home-actions">
          <button className="btn btn--primary" onClick={onResume} type="button">
            이 탭에서 다시 열기
          </button>
          <button className="btn btn--secondary" onClick={onLeave} type="button">
            방에서 나가기
          </button>
        </div>
      </main>
    </div>
  )
}

export function Reconnecting() {
  return (
    <div className="live-home">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
      </header>
      <main aria-labelledby="reconnecting-title" className="live-home-main">
        <h1 id="reconnecting-title">방에 다시 들어가는 중…</h1>
        <p className="live-home-lead" role="status">
          이전에 있던 자리로 돌아가고 있습니다.
        </p>
      </main>
    </div>
  )
}
