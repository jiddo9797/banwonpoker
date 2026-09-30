import { Checkmark20Regular } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import type { ScreenKey } from '../../app/flow'
import { formatChips } from '../../shared/format'
import { lobbyParticipants, roomInfo } from './fixtures'
import './lobby.css'

const steps: Array<{ screen: ScreenKey; label: string }> = [
  { screen: 'entry', label: '입장' },
  { screen: 'seat', label: '좌석 선택' },
  { screen: 'consent', label: '동의' },
  { screen: 'mic', label: '마이크 점검' },
]

interface PrepLayoutProps {
  screen: ScreenKey
  title: string
  nickname?: string
  seatNumber?: number
  /** 내 마이크 상태 문구. 참가자 목록에서 나에게만 보인다(D2). */
  selfMicLabel?: string
  children: ReactNode
}

export function PrepLayout({ screen, title, nickname, seatNumber, selfMicLabel, children }: PrepLayoutProps) {
  const currentIndex = steps.findIndex((step) => step.screen === screen)

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
          <p className="prep-eyebrow">초대받은 방</p>
          <h2>{roomInfo.name}</h2>
          <dl className="room-facts">
            <div>
              <dt>방장</dt>
              <dd>{roomInfo.hostName}</dd>
            </div>
            <div>
              <dt>게임</dt>
              <dd>
                {roomInfo.gameType} <span className="numeric">{roomInfo.smallBlind} / {roomInfo.bigBlind}</span>
              </dd>
            </div>
            <div>
              <dt>시작 칩</dt>
              <dd className="numeric">{formatChips(roomInfo.startingStack)}</dd>
            </div>
            <div>
              <dt>차례 제한</dt>
              <dd>{roomInfo.turnSeconds}초</dd>
            </div>
            <div>
              <dt>방 코드</dt>
              <dd className="numeric">{roomInfo.code}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="prep-participants-title" className="prep-card">
          <div className="prep-card-header">
            <h2 id="prep-participants-title">참가자</h2>
            <span className="prep-caption">
              {lobbyParticipants.length + (nickname ? 1 : 0)} / {roomInfo.maxPlayers}
            </span>
          </div>
          <ul className="lobby-participants">
            {lobbyParticipants.map((participant) => (
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
            {nickname ? (
              <li className="is-self">
                <span className="lobby-participant-name">
                  <strong>{nickname}</strong>
                  <span className="tag">나</span>
                </span>
                <span className="lobby-participant-seat">{seatNumber ? `${seatNumber}번 좌석` : '좌석 선택 중'}</span>
                <span className="status-text">준비 중</span>
                <span className="connection-text is-connected">
                  <span aria-hidden="true" className="dot" />
                  연결됨
                </span>
                {selfMicLabel ? <span className="self-mic-note">마이크: {selfMicLabel} · 나에게만 표시</span> : null}
              </li>
            ) : null}
          </ul>
          <p className="prep-footnote">다른 참가자에게는 준비 여부와 연결 상태만 공개됩니다.</p>
        </section>
      </aside>
    </div>
  )
}
