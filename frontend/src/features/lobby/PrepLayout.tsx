import { Checkmark20Regular, PersonDelete20Regular } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import type { ScreenKey } from '../../app/flow'
import { Avatar } from '../../shared/Avatar'
import { formatChips } from '../../shared/format'
import { ConnectionStatus, TopBar } from '../../shared/TopBar'
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
  /** 실제 게임, 방장: 참가자를 내보낸다. 있으면 참가자마다 내보내기 버튼을 보여준다. */
  onKick?: (participant: LobbyParticipant) => void
  /** 서버 연결 상태(상단 바 오른쪽). 목 데이터는 늘 연결됨 */
  connection?: 'connected' | 'reconnecting' | 'disconnected'
}

interface PrepLayoutProps extends PrepContext {
  screen: ScreenKey
  title: string
  /** 제목 아래 설명 */
  description?: ReactNode
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
  description,
  nickname,
  seatNumber,
  selfReady = false,
  selfMicLabel,
  participants: liveParticipants,
  roomCode,
  onKick,
  connection = 'connected',
  children,
}: PrepLayoutProps) {
  const steps = stepsByRole[role]
  const currentIndex = steps.findIndex((step) => step.screen === screen)
  // 방장은 대기실에 들어가야 친구들이 들어와 있다.
  const participants =
    liveParticipants ?? (role === 'host' && screen !== 'lobby' ? [] : participantsFor(role, seatNumber))

  const roomName = room.name.trim() || '이름 없는 방'
  const code = screen === 'create' ? null : (roomCode ?? ROOM_CODE)
  const people = participants.length + (nickname ? 1 : 0)
  const readyCount = participants.filter((participant) => participant.ready).length + (nickname && selfReady ? 1 : 0)

  return (
    <div className="prep-screen">
      <TopBar
        center={
          <nav aria-label="게임 준비 단계" className="prep-steps">
            <ol>
              {steps.map((step, index) => {
                const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
                return (
                  <li aria-current={state === 'current' ? 'step' : undefined} className={`prep-step is-${state}`} key={step.screen}>
                    {index > 0 ? <span aria-hidden="true" className="prep-step-line" /> : null}
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
        }
        end={<ConnectionStatus state={connection} />}
        title={screen === 'create' || screen === 'entry' ? undefined : roomName}
      />

      <main aria-labelledby="prep-title" className="prep-main">
        <div className="prep-heading">
          <h1 className="prep-title" id="prep-title">
            {title}
          </h1>
          {description ? <p className="prep-description">{description}</p> : null}
        </div>
        {children}
      </main>

      <aside aria-label="방 정보" className="prep-aside">
        <section className="prep-card room-card">
          <div className="room-card-hero">
            <p className="prep-eyebrow">
              {role === 'host' ? '내가 만든 방' : '초대받은 방'}
              {code ? <span className="numeric"> · {code}</span> : null}
            </p>
            <h2>{roomName}</h2>
          </div>
          <dl className="room-facts">
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
          </dl>
          <p className="visually-hidden">방장 {hostName || '나'}</p>
        </section>

        <section aria-labelledby="prep-participants-title" className="prep-card">
          <div className="prep-card-header">
            <h2 id="prep-participants-title">참가자</h2>
            <span className="prep-caption">
              준비 <strong className="numeric">{readyCount}</strong> / {people}
            </span>
          </div>
          <ul className="lobby-participants">
            {nickname ? (
              <li className="is-self">
                <span className="lobby-avatar">
                  <Avatar me name={nickname} size={36} />
                  <span aria-hidden="true" className="lobby-avatar-dot is-connected" />
                </span>
                <span className="lobby-participant-text">
                  <strong>{nickname}</strong>
                  <span className="lobby-participant-seat">
                    {seatNumber ? `${seatNumber}번 좌석` : '좌석 선택 중'} · 나{role === 'host' ? ' · 방장' : ''}
                  </span>
                  {selfMicLabel ? <span className="self-mic-note">마이크: {selfMicLabel} · 나에게만 표시</span> : null}
                </span>
                <span className={selfReady ? 'status-pill is-ok' : 'status-pill'}>{selfReady ? '준비 완료' : '준비 중'}</span>
                <span className="visually-hidden">연결됨</span>
              </li>
            ) : null}
            {participants.map((participant) => (
              <li key={participant.id}>
                <span className="lobby-avatar">
                  <Avatar index={(participant.seatNumber ?? 1) - 1} name={participant.name} size={36} />
                  <span aria-hidden="true" className={`lobby-avatar-dot is-${participant.connection}`} />
                </span>
                <span className="lobby-participant-text">
                  <strong>{participant.name}</strong>
                  <span className="lobby-participant-seat">
                    {participant.seatNumber ? `${participant.seatNumber}번 좌석` : '좌석 선택 중'}
                    {participant.isHost ? ' · 방장' : ''}
                  </span>
                </span>
                {participant.connection === 'connected' ? (
                  <span className={participant.ready ? 'status-pill is-ok' : 'status-pill'}>{participant.ready ? '준비 완료' : '준비 중'}</span>
                ) : (
                  <span className="status-pill is-warning">연결 끊김</span>
                )}
                <span className="visually-hidden">
                  {participant.connection === 'connected' ? '연결됨' : participant.ready ? '준비 완료' : '준비 중'}
                </span>
                {onKick && role === 'host' ? (
                  <button aria-label={`내보내기 ${participant.name}`} className="kick-button" onClick={() => onKick(participant)} title="내보내기" type="button">
                    <PersonDelete20Regular aria-hidden="true" />
                  </button>
                ) : null}
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
