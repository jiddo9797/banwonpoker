import {
  DoorArrowLeft20Regular,
  Navigation20Regular,
  Person20Regular,
  Settings20Regular,
  Share20Regular,
} from '@fluentui/react-icons'
import type { ScenarioKey, TableSnapshot } from '../model'

const scenarioOptions: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'opp', label: '상대 차례' },
  { key: 'my', label: '내 차례' },
  { key: 'pending', label: '액션 처리 중' },
  { key: 'fold', label: '폴드 직후' },
  { key: 'allin', label: '올인 · 사이드팟' },
  { key: 'showdown', label: '쇼다운' },
  { key: 'disc', label: '연결 끊김' },
  { key: 'micfail', label: '마이크 실패' },
]

interface TableChromeProps {
  snapshot: TableSnapshot
  scenarioKey: ScenarioKey
  onScenarioChange: (key: ScenarioKey) => void
  onInvite: () => void
  onLeave: () => void
}

function connectionLabel(connection: TableSnapshot['connection']) {
  if (connection === 'reconnecting') return '재연결 중'
  if (connection === 'disconnected') return '연결 끊김'
  return '연결됨'
}

export function TableChrome({
  snapshot,
  scenarioKey,
  onScenarioChange,
  onInvite,
  onLeave,
}: TableChromeProps) {
  return (
    <>
      <div className="wordmark">banwonpoker</div>

      <label className="scenario-picker">
        <span>프로토타입 상태</span>
        <select
          aria-label="프로토타입 화면 상태"
          onChange={(event) => onScenarioChange(event.target.value as ScenarioKey)}
          value={scenarioKey}
        >
          {scenarioOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <nav aria-label="테이블 메뉴" className="side-menu">
        <button type="button">
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
      </nav>

      <header className="table-header">
        <div className="session-meta">
          <span className={`connection-state connection-state--${snapshot.connection}`}>
            <span aria-hidden="true" className="connection-dot" />
            {connectionLabel(snapshot.connection)}
          </span>
          <span aria-hidden="true" className="meta-divider" />
          <span>방장</span>
          <span aria-hidden="true" className="meta-divider" />
          <span>핸드 #{snapshot.handNumber}</span>
        </div>
        <div className="game-meta">
          <span>{snapshot.gameType}</span>
          <strong>
            {snapshot.smallBlind} / {snapshot.bigBlind}
          </strong>
        </div>
        <div className="header-actions">
          <button onClick={onInvite} type="button">
            <Share20Regular aria-hidden="true" />
            초대
          </button>
          <button type="button">
            <Settings20Regular aria-hidden="true" />
            설정
          </button>
        </div>
      </header>
    </>
  )
}
