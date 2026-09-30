import { ChevronDown20Regular, ChevronUp20Regular } from '@fluentui/react-icons'
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { formatChips } from '../../../shared/format'
import type { PanelTab, TableSnapshot } from '../model'

const tabs: Array<{ id: PanelTab; label: string }> = [
  { id: 'log', label: '로그' },
  { id: 'participants', label: '참가자' },
]

interface SidePanelProps {
  snapshot: TableSnapshot
  activeTab: PanelTab
  collapsed: boolean
  onTabChange: (tab: PanelTab) => void
  onToggleCollapsed: () => void
}

export function SidePanel({
  snapshot,
  activeTab,
  collapsed,
  onTabChange,
  onToggleCollapsed,
}: SidePanelProps) {
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({})

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
    <section aria-label="로그와 참가자" className={`side-panel ${collapsed ? 'is-collapsed' : ''}`}>
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

      {!collapsed && activeTab === 'log' ? (
        <div aria-labelledby="log-tab" className="panel-body" id="log-panel" role="tabpanel" tabIndex={0}>
          <ol className="game-log">
            {snapshot.logs.slice(0, 5).map((log, index) => (
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
              <li key={seat.id}>
                <span className={`participant-state participant-state--${seat.status}`}>
                  <span aria-hidden="true" />
                  {seat.status === 'disconnected' ? '연결 끊김' : seat.status === 'empty' ? '빈 좌석' : '연결됨'}
                </span>
                <strong>{seat.name}</strong>
                <span>{formatChips(seat.stack)}</span>
              </li>
            ))}
            <li>
              <span className="participant-state participant-state--active">
                <span aria-hidden="true" /> 연결됨
              </span>
              <strong>나</strong>
              <span>{formatChips(snapshot.heroStack)}</span>
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  )
}
