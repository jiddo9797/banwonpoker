import type { ReactNode } from 'react'

interface TopBarProps {
  /** 워드마크 옆에 쓰는 방 이름이나 화면 이름 */
  title?: string
  /** 제목 옆 알약(게임 종류, 블라인드, 핸드 번호 등) */
  pills?: ReactNode
  /** 가운데(준비 단계 표시 등) */
  center?: ReactNode
  /** 오른쪽(연결 상태, 버튼) */
  end?: ReactNode
}

/** 모든 화면이 함께 쓰는 56px 상단 바. 워드마크 | 제목 | 알약 … 가운데 … 오른쪽 버튼 */
export function TopBar({ title, pills, center, end }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-start">
        <div className="wordmark">banwonpoker</div>
        {title ? (
          <>
            <span aria-hidden="true" className="top-bar-divider" />
            <span className="top-bar-title">{title}</span>
          </>
        ) : null}
        {pills ? <div className="top-bar-pills">{pills}</div> : null}
      </div>
      {center ? <div className="top-bar-center">{center}</div> : null}
      {end ? <div className="top-bar-end">{end}</div> : null}
    </header>
  )
}

/** 상단 바의 연결 상태. 점 색만이 아니라 글자로도 알린다. */
export function ConnectionStatus({ state, detail }: { state: 'connected' | 'reconnecting' | 'disconnected'; detail?: string }) {
  const label = state === 'reconnecting' ? '재연결 중' : state === 'disconnected' ? '연결 끊김' : '연결됨'
  return (
    <span className={`connection-state connection-state--${state}`}>
      <span aria-hidden="true" className="connection-dot" />
      {detail ? `${label} · ${detail}` : label}
    </span>
  )
}
