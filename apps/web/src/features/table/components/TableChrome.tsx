import {
  DoorArrowLeft20Regular,
  Navigation20Regular,
  Person20Regular,
  Power20Regular,
  Settings20Regular,
  Share20Regular,
} from '@fluentui/react-icons'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { TableSnapshot } from '../model'

interface TableChromeProps {
  snapshot: TableSnapshot
  isHost: boolean
  hostName: string
  /** 블라인드가 오르는 방이면 다음 레벨 안내 */
  blindNote?: string
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onEndSession: () => void
  onInvite: () => void
  onLeave: () => void
  onOpenSettings: () => void
}

function connectionLabel(connection: TableSnapshot['connection']) {
  if (connection === 'reconnecting') return '재연결 중'
  if (connection === 'disconnected') return '연결 끊김'
  return '연결됨'
}

export function TableChrome({
  snapshot,
  isHost,
  hostName,
  blindNote,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onEndSession,
  onInvite,
  onLeave,
  onOpenSettings,
}: TableChromeProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstMenuItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (menuOpen) firstMenuItemRef.current?.focus()
  }, [menuOpen])

  const closeMenuOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !menuOpen) return
    event.stopPropagation()
    onCloseMenu()
    menuButtonRef.current?.focus()
  }

  return (
    <>
      <nav aria-label="테이블 메뉴" className="side-menu" onKeyDown={closeMenuOnEscape}>
        <button
          aria-controls="table-menu-popover"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          ref={menuButtonRef}
          type="button"
        >
          <Navigation20Regular aria-hidden="true" />
          <span>메뉴</span>
        </button>
        <button type="button">
          <Person20Regular aria-hidden="true" />
          <span>자리 비움</span>
        </button>
        <button onClick={onLeave} type="button">
          <DoorArrowLeft20Regular aria-hidden="true" />
          <span>나가기</span>
        </button>

        {menuOpen ? (
          <div className="menu-popover" id="table-menu-popover">
            <p className="menu-popover-caption">{isHost ? '방장 메뉴' : '메뉴'}</p>
            <button
              aria-disabled={!isHost}
              className="menu-popover-item is-danger"
              onClick={() => {
                if (!isHost) return
                // 메뉴 항목은 곧 사라지므로 다이얼로그가 닫힌 뒤 돌아올 곳을 메뉴 버튼으로 둔다.
                menuButtonRef.current?.focus()
                onEndSession()
              }}
              ref={firstMenuItemRef}
              type="button"
            >
              <Power20Regular aria-hidden="true" />
              <span>
                세션 종료
                <small>
                  {isHost ? '전원이 세션 요약과 복기로 이동합니다' : `방장(${hostName})만 세션을 종료할 수 있습니다`}
                </small>
              </span>
            </button>
          </div>
        ) : null}
      </nav>

      <header className="chrome-header">
        <div className="wordmark">banwonpoker</div>
        <div className="table-header">
          <div className="session-meta">
            <span className={`connection-state connection-state--${snapshot.connection}`}>
              <span aria-hidden="true" className="connection-dot" />
              {connectionLabel(snapshot.connection)}
            </span>
            <span aria-hidden="true" className="meta-divider" />
            <span>{isHost ? '방장' : '참가자'}</span>
            <span aria-hidden="true" className="meta-divider" />
            <span>핸드 #{snapshot.handNumber}</span>
          </div>
          <div className="game-meta">
            <span>{snapshot.gameType}</span>
            <strong>
              {snapshot.smallBlind} / {snapshot.bigBlind}
            </strong>
          </div>
          {blindNote ? <div className="blind-note">{blindNote}</div> : null}
          <div className="header-actions">
            <button onClick={onInvite} type="button">
              <Share20Regular aria-hidden="true" />
              초대
            </button>
            <button onClick={onOpenSettings} type="button">
              <Settings20Regular aria-hidden="true" />
              설정
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
