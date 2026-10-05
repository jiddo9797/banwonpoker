import { Clock20Regular, Info20Regular, Link20Regular, Play20Filled } from '@fluentui/react-icons'
import { useEffect, useId, useState } from 'react'
import { RoomRules } from '../room/RoomRules'
import { RoomSettingsForm } from '../room/RoomSettingsForm'
import { hasErrors, MIN_PLAYERS, validateRoomSettings } from '../room/settings'
import type { RoomSettings } from '../room/settings'
import { headcount, lateJoiners, readyHeadcount, ROOM_CODE } from './fixtures'
import { PrepLayout } from './PrepLayout'
import type { PrepContext } from './PrepLayout'

/** 목: 참가자 시점에서 방장이 게임을 시작하기까지 걸리는 시간 */
export const GUEST_AUTO_START_MS = 4000

export const INVITE_URL = `https://banwonpoker.app/r/${ROOM_CODE}`

/** 실제 게임에서 서버 상태로 계산해 넘기는 대기실 정보. 없으면 목 데이터를 쓴다. */
export interface LiveLobbyInfo {
  inviteUrl: string
  headcount: number
  readyCount: number
  lateNames: string[]
  /** 서버가 거절한 이유(시작 실패, 설정 오류 등) */
  errorMessage?: string
}

interface LobbyScreenProps {
  context: PrepContext
  nickname: string
  seatNumber?: number
  selfMicLabel: string
  onSettingsChange: (settings: RoomSettings) => void
  onStart: () => void
  onBack: () => void
  live?: LiveLobbyInfo
}

function InviteBox({ url = INVITE_URL }: { url?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(url)
    } catch {
      // 목 프로토타입에서는 클립보드 권한이 없어도 같은 안내를 보여준다.
    }
    setCopied(true)
  }

  return (
    <div className="invite-box">
      <span aria-hidden="true" className="invite-icon">
        <Link20Regular />
      </span>
      <div className="invite-text">
        <span className="invite-label">초대 링크</span>
        <code>{url}</code>
      </div>
      <button className="btn btn--primary btn--md" onClick={copy} type="button">
        링크 복사
      </button>
      <span aria-live="polite" className="invite-status">
        {copied ? '초대 링크를 복사했습니다' : ''}
      </span>
    </div>
  )
}

function HostLobby({ context, seatNumber, onSettingsChange, onStart, onBack, live }: LobbyScreenProps) {
  const reasonId = useId()
  const errors = validateRoomSettings(context.room)
  const ready = live ? live.readyCount : readyHeadcount('host', seatNumber)
  const lateNames = live ? live.lateNames : lateJoiners('host', seatNumber).map((participant) => participant.name)
  const invalid = hasErrors(errors)
  const canStart = !invalid && ready >= MIN_PLAYERS
  const reason = invalid
    ? '설정 오류를 고쳐야 시작할 수 있습니다.'
    : ready < MIN_PLAYERS
      ? `준비된 참가자가 ${MIN_PLAYERS}명 이상이어야 합니다.`
      : live?.errorMessage

  return (
    <div className="lobby-host">
      <InviteBox url={live?.inviteUrl} />

      <section aria-labelledby="room-settings-title" className="prep-panel">
        <h2 className="prep-panel-title" id="room-settings-title">
          방 설정
        </h2>
        <RoomSettingsForm
          errors={errors}
          headcount={live ? live.headcount : headcount('host')}
          onChange={onSettingsChange}
          settings={context.room}
          showErrors
        />
      </section>

      <div className="start-box">
        <div className="start-box-text">
          <span>
            {lateNames.length > 0
              ? `${lateNames.join('·')}은(는) 준비를 마치면 다음 핸드부터 참여합니다.`
              : '모든 참가자가 준비를 마쳤습니다.'}
          </span>
          {reason ? (
            <span className="field-error" id={reasonId}>
              {reason}
            </span>
          ) : null}
        </div>
        <button className="btn btn--outline btn--lg" onClick={onBack} type="button">
          준비 취소
        </button>
        <button
          aria-describedby={reason ? reasonId : undefined}
          aria-disabled={!canStart}
          className="btn btn--primary btn--lg btn--raised"
          onClick={() => {
            if (canStart) onStart()
          }}
          type="button"
        >
          <Play20Filled aria-hidden="true" />
          게임 시작 · {ready}명
        </button>
      </div>
    </div>
  )
}

function GuestLobby({ context, onStart, onBack, live }: LobbyScreenProps) {
  // 목: 방장이 곧 게임을 시작한 것처럼 일정 시간 뒤 테이블로 넘어간다. 실제 게임에서는 서버가 알려 준다.
  useEffect(() => {
    if (live) return
    const timer = window.setTimeout(onStart, GUEST_AUTO_START_MS)
    return () => window.clearTimeout(timer)
  }, [onStart, live])

  return (
    <div className="prep-panel">
      <section aria-labelledby="waiting-title" className="waiting-status">
        <Clock20Regular aria-hidden="true" />
        <div aria-live="polite">
          <h2 id="waiting-title">방장 {context.hostName}이(가) 게임을 시작하기를 기다리는 중</h2>
          <p>시작되면 자동으로 테이블로 이동합니다. 게임 중에 들어온 참가자는 다음 핸드부터 참여합니다.</p>
        </div>
      </section>

      <section aria-labelledby="guest-rules-title">
        <h2 className="section-title" id="guest-rules-title">
          이 방의 규칙
        </h2>
        <RoomRules settings={context.room} />
      </section>

      <div className="notice">
        <Info20Regular aria-hidden="true" />
        <p>규칙은 방장만 정할 수 있고, 게임이 시작되면 바뀌지 않습니다.</p>
      </div>

      <div className="prep-actions">
        <button className="btn btn--secondary" onClick={onBack} type="button">
          준비 취소
        </button>
      </div>
    </div>
  )
}

export function LobbyScreen(props: LobbyScreenProps) {
  const { context, nickname, seatNumber, selfMicLabel, live } = props
  const isHost = context.role === 'host'
  const ready = live ? live.readyCount : readyHeadcount('host', seatNumber)

  return (
    <PrepLayout
      {...context}
      nickname={nickname}
      screen="lobby"
      seatNumber={seatNumber}
      selfMicLabel={selfMicLabel}
      selfReady
      description={
        isHost ? (
          <>
            준비 완료 <span className="numeric">{ready}</span>명 · 게임을 시작하면 설정을 바꿀 수 없습니다.
          </>
        ) : (
          '방장이 게임을 시작하면 자동으로 테이블로 이동합니다.'
        )
      }
      title={isHost ? '친구들이 준비되면 시작하세요' : '대기실'}
    >
      {isHost ? <HostLobby {...props} /> : <GuestLobby {...props} />}
    </PrepLayout>
  )
}
