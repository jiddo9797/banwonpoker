import { describe, expect, it } from 'vitest'
import { canBeReady, createInitialFlowState, flowReducer } from './flow'
import type { FlowState } from './flow'
import { buildFlowSearch } from './url'

const params = (query: string) => new URLSearchParams(query)

describe('canBeReady (D1)', () => {
  const agreed = { recording: true, reveal: true }

  it.each([
    [{ recording: true, reveal: true }, 'ready', false, true],
    [{ recording: true, reveal: true }, 'denied', true, true],
    [{ recording: true, reveal: true }, 'not-found', true, true],
    [{ recording: true, reveal: true }, 'idle', true, true],
    [{ recording: true, reveal: true }, 'denied', false, false],
    [{ recording: true, reveal: true }, 'checking', false, false],
    [{ recording: false, reveal: true }, 'ready', false, false],
    [{ recording: true, reveal: false }, 'ready', true, false],
  ] as const)('동의 %o, 마이크 %s, 음성 없이 참여 %s → %s', (consent, micStatus, voiceless, expected) => {
    expect(canBeReady({ consent, micStatus, voiceless })).toBe(expected)
  })

  it('동의만으로는 준비할 수 없다', () => {
    expect(canBeReady({ consent: agreed, micStatus: 'idle', voiceless: false })).toBe(false)
  })
})

describe('createInitialFlowState', () => {
  it('파라미터가 없으면 빈 닉네임으로 입장 화면에서 시작한다', () => {
    expect(createInitialFlowState()).toMatchObject({
      screen: 'entry',
      nickname: '',
      seatNumber: undefined,
      consent: { recording: false, reveal: false },
      micStatus: 'idle',
      voiceless: false,
    })
  })

  it('?scenario=만 있는 예전 링크는 테이블로 연다', () => {
    expect(createInitialFlowState(params('scenario=showdown'))).toMatchObject({
      screen: 'table',
      scenarioKey: 'showdown',
      micStatus: 'ready',
    })
  })

  it('알 수 없는 값은 기본값으로 돌린다', () => {
    expect(createInitialFlowState(params('screen=lobby&scenario=nope'))).toMatchObject({
      screen: 'table',
      scenarioKey: 'opp',
    })
  })

  it('중간 화면으로 바로 열면 앞 단계 값을 채운다', () => {
    expect(createInitialFlowState(params('screen=mic&mic=denied'))).toMatchObject({
      nickname: '하늘',
      seatNumber: 6,
      consent: { recording: true, reveal: true },
      micStatus: 'denied',
      micOutcome: 'denied',
    })
    expect(createInitialFlowState(params('screen=consent')).consent).toEqual({ recording: false, reveal: false })
  })

  it('복기 화면의 첫 위치와 내보내기 상태를 URL에서 읽는다', () => {
    const state = createInitialFlowState(params('screen=replay&hand=23&action=5&export=failed&exportResult=failure'))
    expect(state).toMatchObject({
      screen: 'replay',
      replayHandNumber: 23,
      replayEntry: { index: 4, exportStatus: 'failed' },
      exportOutcome: 'failure',
    })
  })
})

describe('flowReducer', () => {
  const at = (overrides: Partial<FlowState>) => ({ ...createInitialFlowState(), ...overrides })

  it('입장 → 좌석 → 동의 순서로 이동한다', () => {
    let state = flowReducer(at({}), { type: 'entry.submitted', nickname: '  하늘 ' })
    expect(state).toMatchObject({ screen: 'seat', nickname: '하늘' })

    state = flowReducer(state, { type: 'seat.selected', seatNumber: 5 })
    expect(state).toMatchObject({ screen: 'consent', seatNumber: 5 })

    state = flowReducer(state, { type: 'consent.changed', key: 'recording', value: true })
    expect(state.consent).toEqual({ recording: true, reveal: false })
  })

  it('마이크 점검은 정한 결과로 끝나고, 확인 중 중복 시작은 무시한다', () => {
    const checking = flowReducer(at({ micOutcome: 'not-found' }), { type: 'mic.checkStarted' })
    expect(checking.micStatus).toBe('checking')
    expect(flowReducer(checking, { type: 'mic.checkStarted' })).toBe(checking)
    expect(flowReducer(checking, { type: 'mic.checkFinished' }).micStatus).toBe('not-found')
  })

  it('확인 중이 아니면 점검 완료를 무시한다', () => {
    const idle = at({})
    expect(flowReducer(idle, { type: 'mic.checkFinished' })).toBe(idle)
  })

  it('마이크가 정상으로 확인되면 음성 없이 참여 선택을 푼다', () => {
    const state = flowReducer(at({ micStatus: 'checking', micOutcome: 'ready', voiceless: true }), {
      type: 'mic.checkFinished',
    })
    expect(state).toMatchObject({ micStatus: 'ready', voiceless: false })
  })

  it('준비 조건을 채우지 못하면 테이블로 가지 않는다', () => {
    const notReady = at({ screen: 'mic', consent: { recording: true, reveal: true }, micStatus: 'denied' })
    expect(flowReducer(notReady, { type: 'ready.confirmed' })).toBe(notReady)

    const voiceless = { ...notReady, voiceless: true }
    expect(flowReducer(voiceless, { type: 'ready.confirmed' })).toMatchObject({ screen: 'table', scenarioKey: 'opp' })
  })

  it('테이블에서 나가면 처음부터 다시 시작하되 개발용 결과 설정은 유지한다', () => {
    const state = flowReducer(
      at({ screen: 'table', nickname: '하늘', voiceless: true, micOutcome: 'denied', exportOutcome: 'failure' }),
      { type: 'table.left' },
    )
    expect(state).toMatchObject({
      screen: 'entry',
      nickname: '',
      voiceless: false,
      micOutcome: 'denied',
      exportOutcome: 'failure',
    })
  })

  it('세션 종료 → 요약 → 복기로 이동하고, URL로 들어온 첫 위치는 지운다', () => {
    let state = flowReducer(at({ screen: 'table', replayEntry: { index: 3 } }), { type: 'session.ended' })
    expect(state.screen).toBe('summary')

    state = flowReducer(state, { type: 'replay.opened', handNumber: 23 })
    expect(state).toMatchObject({ screen: 'replay', replayHandNumber: 23, replayEntry: undefined })
  })
})

describe('buildFlowSearch', () => {
  it('현재 화면에 필요한 값만 남기고 devtools 설정은 유지한다', () => {
    const state = { ...createInitialFlowState(), screen: 'table' as const, scenarioKey: 'allin' as const }
    expect(buildFlowSearch(state, params('mic=denied&devtools=0'))).toBe('?screen=table&scenario=allin&devtools=0')
  })

  it('복기 화면은 핸드 번호를 남긴다', () => {
    const state = { ...createInitialFlowState(), screen: 'replay' as const, replayHandNumber: 23 }
    expect(buildFlowSearch(state, params('export=done'))).toBe('?screen=replay&hand=23')
  })
})
