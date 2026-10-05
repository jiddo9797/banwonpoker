import {
  DoorArrowLeft20Regular,
  Navigation20Regular,
  Person20Regular,
  Power20Regular,
  Settings20Regular,
  Share20Regular,
  Star20Filled,
  Star20Regular,
} from '@fluentui/react-icons'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { TableSnapshot } from '../model'
import { isTypingTarget } from './ActionDock'

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
  /** 실제 게임: 지금 핸드를 복기하려고 표시했는지. onToggleMark가 있으면 표시 버튼(단축키 B)을 보여준다. */
  marked?: boolean
  onToggleMark?: () => void
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
  marked = false,
  onToggleMark,
}: TableChromeProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstMenuItemRef = useRef<HTMLButtonElement>(null)

  // 단축키 B: 지금 핸드 표시. 액션 단축키와 같은 조건(입력 중·확인창·메뉴가 열려 있으면 쓰지 않음)이다.
  const toggleRef = useRef(onToggleMark)
  toggleRef.current = onToggleMark
  const hasMark = onToggleMark !== undefined
  useEffect(() => {
    if (!hasMark) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== 'KeyB' || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"], .menu-popover')) return
      event.preventDefault()
      toggleRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasMark])

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
            {onToggleMark ? (
              <button
                aria-label={`핸드 #${snapshot.handNumber} 복기 표시`}
                aria-pressed={marked}
                className={marked ? 'mark-toggle is-marked' : 'mark-toggle'}
                onClick={onToggleMark}
                title="나중에 복기할 핸드로 표시합니다. 나에게만 보입니다. (단축키 B)"
                type="button"
              >
                {marked ? <Star20Filled aria-hidden="true" /> : <Star20Regular aria-hidden="true" />}
                {marked ? '표시함' : '핸드 표시'}
                <kbd aria-hidden="true">B</kbd>
              </button>
            ) : null}
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
