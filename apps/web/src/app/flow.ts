import type { ExportStatus } from '../features/replay/model'
import { isScenarioKey } from '../features/table/model'
import type { ScenarioKey } from '../features/table/model'

export const screenKeys = ['entry', 'seat', 'consent', 'mic', 'table', 'summary', 'replay'] as const

export type ScreenKey = (typeof screenKeys)[number]

/** 마이크 점검 결과. 목 프로토타입에서는 개발 도구나 URL로 결과를 정한다. */
export const micOutcomes = ['ready', 'denied', 'not-found'] as const

export type MicOutcome = (typeof micOutcomes)[number]

export type MicCheckStatus = 'idle' | 'checking' | MicOutcome

export const exportOutcomes = ['success', 'failure'] as const

export type ExportOutcome = (typeof exportOutcomes)[number]

export interface ConsentState {
  recording: boolean
  reveal: boolean
}

export interface FlowState {
  screen: ScreenKey
  scenarioKey: ScenarioKey
  nickname: string
  seatNumber?: number
  consent: ConsentState
  micStatus: MicCheckStatus
  /** 다음 마이크 점검이 어떤 결과로 끝날지(목) */
  micOutcome: MicOutcome
  /** `음성 없이 참여`를 명시적으로 선택했는지 */
  voiceless: boolean
  /** 다음 내보내기가 성공할지 실패할지(목) */
  exportOutcome: ExportOutcome
  /** 복기 화면에서 열 핸드 번호 */
  replayHandNumber?: number
  /** URL로 복기 화면을 바로 열 때만 쓰는 첫 위치·내보내기 상태. 요약에서 복기를 열면 지운다. */
  replayEntry?: { index?: number; exportStatus?: ExportStatus }
}

export type FlowAction =
  | { type: 'screen.changed'; screen: ScreenKey }
  | { type: 'scenario.changed'; scenarioKey: ScenarioKey }
  | { type: 'entry.submitted'; nickname: string }
  | { type: 'seat.selected'; seatNumber: number }
  | { type: 'consent.changed'; key: keyof ConsentState; value: boolean }
  | { type: 'mic.checkStarted' }
  | { type: 'mic.checkFinished' }
  | { type: 'mic.outcomeChanged'; outcome: MicOutcome }
  | { type: 'mic.voicelessChanged'; voiceless: boolean }
  | { type: 'ready.confirmed' }
  | { type: 'table.left' }
  | { type: 'session.ended' }
  | { type: 'replay.opened'; handNumber: number }
  | { type: 'export.outcomeChanged'; outcome: ExportOutcome }

export const DEFAULT_NICKNAME = '하늘'
export const DEFAULT_SEAT = 6

export function isScreenKey(value: string | null): value is ScreenKey {
  return screenKeys.includes(value as ScreenKey)
}

export function isMicOutcome(value: string | null): value is MicOutcome {
  return micOutcomes.includes(value as MicOutcome)
}

export function isExportOutcome(value: string | null): value is ExportOutcome {
  return exportOutcomes.includes(value as ExportOutcome)
}

/** D1: 녹음·전체 패 공개 동의는 필수, 마이크는 정상이거나 `음성 없이 참여`를 명시적으로 골라야 한다. */
export function canBeReady(state: Pick<FlowState, 'consent' | 'micStatus' | 'voiceless'>) {
  const consented = state.consent.recording && state.consent.reveal
  return consented && (state.micStatus === 'ready' || state.voiceless)
}

const initialExportStatuses: ExportStatus[] = ['options', 'generating', 'done', 'failed']

function readReplayEntry(params: URLSearchParams): FlowState['replayEntry'] {
  const action = Number(params.get('action'))
  const exportParam = params.get('export')
  return {
    index: Number.isInteger(action) && action > 0 ? action - 1 : undefined,
    exportStatus: initialExportStatuses.find((status) => status === exportParam),
  }
}

export function createInitialFlowState(params: URLSearchParams = new URLSearchParams()): FlowState {
  const screenParam = params.get('screen')
  const scenarioParam = params.get('scenario')
  const micParam = params.get('mic')
  const exportParam = params.get('exportResult')
  // `?scenario=`만 있는 기존 링크는 테이블 화면으로 연다.
  const screen: ScreenKey = isScreenKey(screenParam) ? screenParam : scenarioParam ? 'table' : 'entry'
  const skipsPreparation = screenKeys.indexOf(screen) > screenKeys.indexOf('seat')
  const micOutcome = isMicOutcome(micParam) ? micParam : 'ready'

  return {
    screen,
    scenarioKey: isScenarioKey(scenarioParam) ? scenarioParam : 'opp',
    nickname: screen === 'entry' ? '' : DEFAULT_NICKNAME,
    seatNumber: skipsPreparation ? DEFAULT_SEAT : undefined,
    consent: {
      recording: screenKeys.indexOf(screen) > screenKeys.indexOf('consent'),
      reveal: screenKeys.indexOf(screen) > screenKeys.indexOf('consent'),
    },
    micStatus: screen === 'mic' && isMicOutcome(micParam) ? micParam : screen === 'table' ? 'ready' : 'idle',
    micOutcome,
    voiceless: params.get('voiceless') === '1',
    exportOutcome: isExportOutcome(exportParam) ? exportParam : 'success',
    replayHandNumber: Number(params.get('hand')) || undefined,
    replayEntry: screen === 'replay' ? readReplayEntry(params) : undefined,
  }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'screen.changed':
      return { ...state, screen: action.screen }

    case 'scenario.changed':
      return { ...state, scenarioKey: action.scenarioKey }

    case 'entry.submitted':
      return { ...state, nickname: action.nickname.trim(), screen: 'seat' }

    case 'seat.selected':
      return { ...state, seatNumber: action.seatNumber, screen: 'consent' }

    case 'consent.changed':
      return { ...state, consent: { ...state.consent, [action.key]: action.value } }

    case 'mic.checkStarted':
      if (state.micStatus === 'checking') return state
      return { ...state, micStatus: 'checking' }

    case 'mic.checkFinished':
      if (state.micStatus !== 'checking') return state
      return {
        ...state,
        micStatus: state.micOutcome,
        // 마이크가 정상으로 확인되면 `음성 없이 참여` 선택은 의미가 없어진다.
        voiceless: state.micOutcome === 'ready' ? false : state.voiceless,
      }

    case 'mic.outcomeChanged':
      return { ...state, micOutcome: action.outcome }

    case 'mic.voicelessChanged':
      return { ...state, voiceless: action.voiceless }

    case 'ready.confirmed':
      if (!canBeReady(state)) return state
      return { ...state, screen: 'table', scenarioKey: 'opp' }

    case 'table.left':
      return {
        ...createInitialFlowState(),
        micOutcome: state.micOutcome,
        exportOutcome: state.exportOutcome,
      }

    case 'session.ended':
      return { ...state, screen: 'summary' }

    case 'replay.opened':
      return { ...state, screen: 'replay', replayHandNumber: action.handNumber, replayEntry: undefined }

    case 'export.outcomeChanged':
      return { ...state, exportOutcome: action.outcome }
  }
}
