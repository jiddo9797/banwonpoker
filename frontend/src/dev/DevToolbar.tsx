import { Wrench20Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import { exportOutcomes, micOutcomes, screenKeys } from '../app/flow'
import type { ExportOutcome, FlowAction, FlowState, MicOutcome, Role, ScreenKey } from '../app/flow'
import { scenarioKeys } from '../features/table/model'
import type { ScenarioKey } from '../features/table/model'
import './devtools.css'

const screenLabels: Record<ScreenKey, string> = {
  create: '0 · 방 만들기(방장)',
  entry: '1 · 입장(참가자)',
  seat: '2 · 좌석 선택',
  consent: '3 · 동의',
  mic: '4 · 마이크 점검',
  lobby: '5 · 대기실',
  table: '6 · 테이블',
  summary: '7 · 세션 요약',
  replay: '8 · 복기',
}

const scenarioLabels: Record<ScenarioKey, string> = {
  opp: '상대 차례',
  my: '내 차례',
  pending: '액션 처리 중',
  fold: '폴드 직후',
  allin: '올인 · 사이드팟',
  showdown: '쇼다운',
  disc: '연결 끊김',
  micfail: '마이크 실패',
  elim: '탈락 · 다음 핸드 참가',
}

const micLabels: Record<MicOutcome, string> = {
  ready: '정상',
  denied: '권한 거부',
  'not-found': '장치 없음',
}

const exportLabels: Record<ExportOutcome, string> = {
  success: '성공',
  failure: '실패',
}

interface DevToolbarProps {
  state: FlowState
  dispatch: (action: FlowAction) => void
}

/**
 * 프로토타입 검토용 상태 선택기. 제품 화면(1440×900 캔버스) 밖에 떠 있고,
 * 프로덕션 빌드에는 포함되지 않는다.
 */
export default function DevToolbar({ state, dispatch }: DevToolbarProps) {
  const [open, setOpen] = useState(false)

  return (
    <aside aria-label="프로토타입 개발 도구" className="devtools">
      <button
        aria-controls="devtools-panel"
        aria-expanded={open}
        className="devtools-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Wrench20Regular aria-hidden="true" />
        개발 도구
        <span className="devtools-current">
          {screenLabels[state.screen]}
          {state.screen === 'table' ? ` · ${scenarioLabels[state.scenarioKey]}` : ''}
        </span>
      </button>

      {open ? (
        <div className="devtools-panel" id="devtools-panel">
          <label>
            <span>화면</span>
            <select
              onChange={(event) => dispatch({ type: 'screen.changed', screen: event.target.value as ScreenKey })}
              value={state.screen}
            >
              {screenKeys.map((key) => (
                <option key={key} value={key}>
                  {screenLabels[key]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>테이블 상태</span>
            <select
              onChange={(event) => {
                dispatch({ type: 'scenario.changed', scenarioKey: event.target.value as ScenarioKey })
                dispatch({ type: 'screen.changed', screen: 'table' })
              }}
              value={state.scenarioKey}
            >
              {scenarioKeys.map((key) => (
                <option key={key} value={key}>
                  {key} · {scenarioLabels[key]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>마이크 점검 결과</span>
            <select
              onChange={(event) => dispatch({ type: 'mic.outcomeChanged', outcome: event.target.value as MicOutcome })}
              value={state.micOutcome}
            >
              {micOutcomes.map((key) => (
                <option key={key} value={key}>
                  {micLabels[key]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>영상 내보내기 결과</span>
            <select
              onChange={(event) =>
                dispatch({ type: 'export.outcomeChanged', outcome: event.target.value as ExportOutcome })
              }
              value={state.exportOutcome}
            >
              {exportOutcomes.map((key) => (
                <option key={key} value={key}>
                  {exportLabels[key]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>내 역할</span>
            <select
              onChange={(event) => dispatch({ type: 'role.changed', role: event.target.value as Role })}
              value={state.role}
            >
              <option value="host">방장</option>
              <option value="guest">참가자</option>
            </select>
          </label>

          <label className="devtools-check">
            <input
              checked={state.voiceless}
              onChange={(event) => dispatch({ type: 'mic.voicelessChanged', voiceless: event.target.checked })}
              type="checkbox"
            />
            <span>음성 없이 참여</span>
          </label>

          <p className="devtools-hint">URL에 ?devtools=0을 붙이면 이 도구를 숨깁니다.</p>
        </div>
      ) : null}
    </aside>
  )
}
