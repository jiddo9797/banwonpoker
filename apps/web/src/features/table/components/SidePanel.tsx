import { ChevronDown20Regular, ChevronUp20Regular } from '@fluentui/react-icons'
import type { PanelTab, TableSnapshot } from '../model'

function formatChips(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}

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
  const moveTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onTabChange(activeTab === 'log' ? 'participants' : 'log')
  }

  return (
    <section className={`side-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-header">
        <div aria-label="테이블 정보" className="panel-tabs" onKeyDown={moveTab} role="tablist">
          <button
            aria-controls="log-panel"
            aria-selected={activeTab === 'log'}
            id="log-tab"
            onClick={() => onTabChange('log')}
            role="tab"
            tabIndex={activeTab === 'log' ? 0 : -1}
            type="button"
          >
            로그
          </button>
          <button
            aria-controls="participants-panel"
            aria-selected={activeTab === 'participants'}
            id="participants-tab"
            onClick={() => onTabChange('participants')}
            role="tab"
            tabIndex={activeTab === 'participants' ? 0 : -1}
            type="button"
          >
            참가자
          </button>
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
        <div aria-labelledby="log-tab" className="panel-body" id="log-panel" role="tabpanel">
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
