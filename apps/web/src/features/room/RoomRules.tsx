import { formatChips } from '../../shared/format'
import { blindSummary, formatBlinds, TURN_SECONDS } from './settings'
import type { RoomSettings } from './settings'
import './room.css'

interface RoomRulesProps {
  settings: RoomSettings
  /** 레벨 표까지 보여줄지 */
  showLevels?: boolean
}

/** 방 규칙 읽기 전용 목록. 참가자 대기실과 게임 중 설정 창에서 쓴다. */
export function RoomRules({ settings, showLevels = true }: RoomRulesProps) {
  return (
    <div className="room-rules">
      <dl className="room-facts">
        <div>
          <dt>블라인드</dt>
          <dd>{blindSummary(settings)}</dd>
        </div>
        <div>
          <dt>시작 칩</dt>
          <dd className="numeric">{formatChips(settings.startingStack)}</dd>
        </div>
        <div>
          <dt>최대 인원</dt>
          <dd>{settings.maxPlayers}명</dd>
        </div>
        <div>
          <dt>차례 제한</dt>
          <dd>{TURN_SECONDS}초</dd>
        </div>
        <div>
          <dt>칩을 모두 잃으면</dt>
          <dd>탈락</dd>
        </div>
        <div>
          <dt>게임 중 입장</dt>
          <dd>다음 핸드부터 참여</dd>
        </div>
      </dl>

      {showLevels && settings.blindMode === 'increasing' ? (
        <ol aria-label="블라인드 레벨" className="level-list">
          {settings.levels.map((item, index) => (
            <li key={index}>
              <span>레벨 {index + 1}</span>
              <strong className="numeric">{formatBlinds(item)}</strong>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
