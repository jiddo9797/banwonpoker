import { Checkmark20Regular } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import type { ScreenKey } from '../../app/flow'
import { formatChips } from '../../shared/format'
import { blindSummary, TURN_SECONDS } from '../room/settings'
import type { RoomSettings } from '../room/settings'
import { participantsFor, ROOM_CODE } from './fixtures'
import type { LobbyParticipant, LobbyRole } from './fixtures'
import './lobby.css'

const stepsByRole: Record<LobbyRole, Array<{ screen: ScreenKey; label: string }>> = {
  host: [
    { screen: 'create', label: '방 만들기' },
    { screen: 'seat', label: '좌석 선택' },
    { screen: 'consent', label: '동의' },
    { screen: 'mic', label: '마이크 점검' },
    { screen: 'lobby', label: '대기실' },
  ],
  guest: [
    { screen: 'entry', label: '입장' },
    { screen: 'seat', label: '좌석 선택' },
    { screen: 'consent', label: '동의' },
    { screen: 'mic', label: '마이크 점검' },
    { screen: 'lobby', label: '대기실' },
  ],
}

/** 준비 화면들이 공통으로 받는 방 정보 */
export interface PrepContext {
  role: LobbyRole
  room: RoomSettings
  hostName: string
  /** 실제 게임: 서버가 알려 준 다른 참가자(나 제외). 없으면 목 데이터를 쓴다. */
  participants?: LobbyParticipant[]
  /** 실제 게임: 방 코드 */
  roomCode?: string
}

interface PrepLayoutProps extends PrepContext {
  screen: ScreenKey
  title: string
  nickname?: string
  seatNumber?: number
  /** 내가 준비를 마쳤는지(대기실) */
  selfReady?: boolean
  /** 내 마이크 상태 문구. 참가자 목록에서 나에게만 보인다(D2). */
  selfMicLabel?: string
  children: ReactNode
}

export function PrepLayout({
  screen,
  role,
  room,
  hostName,
  title,
  nickname,
  seatNumber,
  selfReady = false,
  selfMicLabel,
  participants: liveParticipants,
  roomCode,
  children,
}: PrepLayoutProps) {
  const steps = stepsByRole[role]
  const currentIndex = steps.findIndex((step) => step.screen === screen)
  // 방장은 대기실에 들어가야 친구들이 들어와 있다.
  const participants =
    liveParticipants ?? (role === 'host' && screen !== 'lobby' ? [] : participantsFor(role, seatNumber))

  return (
    <div className="prep-screen">
      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
        <nav aria-label="게임 준비 단계" className="prep-steps">
          <ol>
            {steps.map((step, index) => {
              const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
              return (
                <li aria-current={state === 'current' ? 'step' : undefined} className={`prep-step is-${state}`} key={step.screen}>
                  <span aria-hidden="true" className="prep-step-index">
                    {state === 'done' ? <Checkmark20Regular /> : index + 1}
                  </span>
                  <span>
                    {step.label}
                    {state === 'done' ? <span className="visually-hidden"> (완료)</span> : null}
                  </span>
                </li>
              )
            })}
          </ol>
        </nav>
      </header>

      <main aria-labelledby="prep-title" className="prep-main">
        <h1 className="prep-title" id="prep-title">
          {title}
        </h1>
        {children}
      </main>

      <aside aria-label="방 정보" className="prep-aside">
        <section className="prep-card room-card">
          <p className="prep-eyebrow">{role === 'host' ? '내가 만든 방' : '초대받은 방'}</p>
          <h2>{room.name.trim() || '이름 없는 방'}</h2>
          <dl className="room-facts">
            <div>
              <dt>방장</dt>
              <dd>{hostName || '나'}</dd>
            </div>
            <div>
              <dt>게임</dt>
              <dd>노리밋 홀덤 · 최대 {room.maxPlayers}명</dd>
            </div>
            <div>
              <dt>블라인드</dt>
              <dd>{blindSummary(room)}</dd>
            </div>
            <div>
              <dt>시작 칩</dt>
              <dd className="numeric">{formatChips(room.startingStack)}</dd>
            </div>
            <div>
              <dt>차례 제한</dt>
              <dd>{TURN_SECONDS}초</dd>
            </div>
            <div>
              <dt>방 코드</dt>
              <dd className="numeric">{screen === 'create' ? '만들면 발급' : (roomCode ?? ROOM_CODE)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="prep-participants-title" className="prep-card">
          <div className="prep-card-header">
            <h2 id="prep-participants-title">참가자</h2>
            <span className="prep-caption">
              {participants.length + (nickname ? 1 : 0)} / {room.maxPlayers}
            </span>
          </div>
          <ul className="lobby-participants">
            {nickname ? (
              <li className="is-self">
                <span className="lobby-participant-name">
                  <strong>{nickname}</strong>
                  <span className="tag">나</span>
                  {role === 'host' ? <span className="tag">방장</span> : null}
                </span>
                <span className="lobby-participant-seat">{seatNumber ? `${seatNumber}번 좌석` : '좌석 선택 중'}</span>
                <span className={`status-text ${selfReady ? 'is-ok' : ''}`}>{selfReady ? '준비 완료' : '준비 중'}</span>
                <span className="connection-text is-connected">
                  <span aria-hidden="true" className="dot" />
                  연결됨
                </span>
                {selfMicLabel ? <span className="self-mic-note">마이크: {selfMicLabel} · 나에게만 표시</span> : null}
              </li>
            ) : null}
            {participants.map((participant) => (
              <li key={participant.id}>
                <span className="lobby-participant-name">
                  <strong>{participant.name}</strong>
                  {participant.isHost ? <span className="tag">방장</span> : null}
                </span>
                <span className="lobby-participant-seat">
                  {participant.seatNumber ? `${participant.seatNumber}번 좌석` : '좌석 선택 중'}
                </span>
                <span className={`status-text ${participant.ready ? 'is-ok' : ''}`}>
                  {participant.ready ? '준비 완료' : '준비 중'}
                </span>
                <span className={`connection-text is-${participant.connection}`}>
                  <span aria-hidden="true" className="dot" />
                  {participant.connection === 'connected' ? '연결됨' : '연결 끊김'}
                </span>
              </li>
            ))}
            {participants.length === 0 && role === 'host' ? (
              <li className="lobby-empty">초대 링크를 보내면 들어온 친구들이 여기에 표시됩니다.</li>
            ) : null}
          </ul>
          <p className="prep-footnote">다른 참가자에게는 준비 여부와 연결 상태만 공개됩니다.</p>
        </section>
      </aside>
    </div>
  )
}
