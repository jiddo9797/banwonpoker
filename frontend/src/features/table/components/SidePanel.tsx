import { ChevronDown20Regular, ChevronUp20Regular, PersonDelete20Regular } from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { formatChips } from '../../../shared/format'
import type { ChatLine, PanelTab, TableSnapshot } from '../model'

const CHAT_MAX_LENGTH = 200

const tabs: Array<{ id: PanelTab; label: string }> = [
  { id: 'chat', label: '채팅' },
  { id: 'log', label: '로그' },
  { id: 'participants', label: '참가자' },
]

interface SidePanelProps {
  snapshot: TableSnapshot
  activeTab: PanelTab
  collapsed: boolean
  onTabChange: (tab: PanelTab) => void
  onToggleCollapsed: () => void
  /** 방장: 참가자를 내보낸다. 있으면 참가자마다 내보내기 버튼을 보여준다. */
  onKick?: (target: { id: string; name: string }) => void
  /** 채팅 메시지(오래된 것부터) */
  chatMessages: ChatLine[]
  onSendChat: (text: string) => void
}

function ChatPanel({ messages, onSend }: { messages: ChatLine[]; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const canSend = draft.trim().length > 0

  // 새 메시지가 오면 맨 아래로 내린다.
  const lastId = messages.at(-1)?.id
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [lastId])

  const send = () => {
    if (!canSend) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <div aria-labelledby="chat-tab" className="chat-panel" id="chat-panel" role="tabpanel">
      <ol aria-label="채팅 메시지" className="chat-messages" ref={listRef} tabIndex={0}>
        {messages.map((message) => (
          <li className={message.mine ? 'is-mine' : undefined} key={message.id}>
            <strong>{message.name}</strong>
            <span>{message.text}</span>
          </li>
        ))}
      </ol>
      <form
        className="chat-input-row"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <input
          aria-label="채팅 입력"
          enterKeyHint="send"
          maxLength={CHAT_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중 Enter는 글자를 확정할 뿐 보내지 않는다.
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
          }}
          placeholder="메시지 입력"
          type="text"
          value={draft}
        />
        <button aria-disabled={!canSend} className="chat-send" type="submit">
          보내기
        </button>
      </form>
    </div>
  )
}

function KickButton({ id, name, onKick }: { id: string; name: string; onKick: NonNullable<SidePanelProps['onKick']> }) {
  return (
    <button aria-label={`${name} 내보내기`} className="kick-icon-button" onClick={() => onKick({ id, name })} title="내보내기" type="button">
      <PersonDelete20Regular aria-hidden="true" />
    </button>
  )
}

export function SidePanel({
  snapshot,
  activeTab,
  collapsed,
  onTabChange,
  onToggleCollapsed,
  onKick,
  chatMessages,
  onSendChat,
}: SidePanelProps) {
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({})

  // 안 읽은 채팅: 채팅 탭을 펼쳐 보고 있지 않을 때 남이 보낸 메시지 수. 처음 열었을 때 이미 있던 메시지는 읽은 것으로 본다.
  const lastChatId = chatMessages.at(-1)?.id
  const [seenChatId, setSeenChatId] = useState(lastChatId)
  const viewingChat = !collapsed && activeTab === 'chat'
  if (viewingChat && seenChatId !== lastChatId) setSeenChatId(lastChatId)
  const seenIndex = chatMessages.findIndex((message) => message.id === seenChatId)
  const unreadChats = viewingChat
    ? 0
    : chatMessages.slice(seenIndex + 1).filter((message) => !message.mine).length

  // WAI-ARIA 탭 패턴: 방향키·Home·End로 탭을 바꾸고 포커스도 함께 옮긴다.
  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab)
    let nextIndex: number

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return

    event.preventDefault()
    const nextTab = tabs[nextIndex].id
    onTabChange(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <section aria-label="채팅, 로그, 참가자" className={`side-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-header">
        <div aria-label="테이블 정보" className="panel-tabs" onKeyDown={moveTab} role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={collapsed ? undefined : `${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              id={`${tab.id}-tab`}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              ref={(element) => {
                tabRefs.current[tab.id] = element
              }}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              {tab.label}
              {tab.id === 'chat' && unreadChats > 0 ? (
                <span className="tab-unread">
                  <span aria-hidden="true">{unreadChats > 9 ? '9+' : unreadChats}</span>
                  <span className="visually-hidden">, 안 읽은 메시지 {unreadChats}개</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          aria-expanded={!collapsed}
          className="panel-collapse"
          onClick={onToggleCollapsed}
          type="button"
        >
          {collapsed ? (
            <>
              펼치기 <ChevronUp20Regular aria-hidden="true" />
            </>
          ) : (
            <>
              접기 <ChevronDown20Regular aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {!collapsed && activeTab === 'chat' ? <ChatPanel messages={chatMessages} onSend={onSendChat} /> : null}

      {!collapsed && activeTab === 'log' ? (
        <div aria-labelledby="log-tab" className="panel-body" id="log-panel" role="tabpanel" tabIndex={0}>
          <ol className="game-log">
            {snapshot.logs.slice(0, 10).map((log, index) => (
              <li className={index === 0 ? 'is-latest' : ''} key={`${log}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {log}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!collapsed && activeTab === 'participants' ? (
        <div
          aria-labelledby="participants-tab"
          className="panel-body"
          id="participants-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <ul className="participant-list">
            {snapshot.seats.map((seat) => (
              <li className={onKick && seat.status !== 'empty' ? 'can-kick' : undefined} key={seat.id}>
                <span className={`participant-state participant-state--${seat.status}`}>
                  <span aria-hidden="true" />
                  {seat.status === 'disconnected'
                    ? '연결 끊김'
                    : seat.status === 'eliminated'
                      ? '탈락'
                      : seat.status === 'empty'
                        ? '빈 좌석'
                        : '연결됨'}
                </span>
                <strong>{seat.name}</strong>
                <span>{formatChips(seat.stack)}</span>
                {onKick && seat.status !== 'empty' ? <KickButton id={seat.id} name={seat.name} onKick={onKick} /> : null}
              </li>
            ))}
            <li>
              <span className="participant-state participant-state--active">
                <span aria-hidden="true" /> 연결됨
              </span>
              <strong>나</strong>
              <span>{formatChips(snapshot.heroStack)}</span>
            </li>
            {snapshot.waitingPlayers?.map((name, index) => {
              const id = snapshot.waitingPlayerIds?.[index]
              return (
              <li className={`is-waiting ${onKick && id ? 'can-kick' : ''}`} key={name}>
                <span className="participant-state participant-state--waiting">
                  <span aria-hidden="true" /> 대기
                </span>
                <strong>{name}</strong>
                <span>다음 핸드부터</span>
                {onKick && id ? <KickButton id={id} name={name} onKick={onKick} /> : null}
              </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
