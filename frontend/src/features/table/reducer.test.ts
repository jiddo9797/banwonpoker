import { describe, expect, it } from 'vitest'
import { getTableSnapshot } from './fixtures'
import type { PrototypeState } from './model'
import { createInitialPrototypeState, prototypeReducer } from './reducer'

function stateFor(scenario: Parameters<typeof createInitialPrototypeState>[0], overrides: Partial<PrototypeState> = {}) {
  return { ...createInitialPrototypeState(scenario), ...overrides }
}

describe('createInitialPrototypeState', () => {
  it('기본값은 상대 차례, 채팅 탭, 펼친 패널이다', () => {
    const state = createInitialPrototypeState()

    expect(state).toMatchObject({
      scenarioKey: 'opp',
      panelTab: 'chat',
      panelCollapsed: false,
      demoPhase: 'idle',
      pendingAction: undefined,
      leaveDialogOpen: false,
      menuOpen: false,
      endSessionDialogOpen: false,
    })
  })

  it('1280×720 이하 화면에서는 로그 패널을 접은 채로 시작한다', () => {
    expect(createInitialPrototypeState('opp', true).panelCollapsed).toBe(true)
  })

  it('pending 시나리오는 레이즈 처리 대기 상태로 시작한다', () => {
    expect(createInitialPrototypeState('pending')).toMatchObject({ demoPhase: 'pending', pendingAction: 'raise' })
  })

  it('시나리오의 토스트를 그대로 가져온다', () => {
    expect(createInitialPrototypeState('disc').toast?.kind).toBe('warning')
    expect(createInitialPrototypeState('my').toast).toBeUndefined()
  })
})

describe('bet.amountChanged', () => {
  const my = getTableSnapshot('my')

  it('최소 레이즈와 내 스택 사이로 제한한다', () => {
    const low = prototypeReducer(stateFor('my'), { type: 'bet.amountChanged', amount: 10 })
    const high = prototypeReducer(stateFor('my'), { type: 'bet.amountChanged', amount: 1_000_000 })

    expect(low.selectedBetAmount).toBe(my.minRaise)
    expect(high.selectedBetAmount).toBe(my.maxRaise)
  })

  it('50 단위로 반올림한다', () => {
    const state = prototypeReducer(stateFor('my'), { type: 'bet.amountChanged', amount: 2_430 })
    expect(state.selectedBetAmount).toBe(2_450)
  })

  it('숫자가 아닌 값은 시나리오 기본 금액으로 되돌린다', () => {
    const state = prototypeReducer(stateFor('my'), { type: 'bet.amountChanged', amount: Number.NaN })
    expect(state.selectedBetAmount).toBe(my.selectedBetAmount)
  })
})

describe('액션 제출 흐름', () => {
  it('액션을 제출하면 pending으로 바뀌고 토스트를 지운다', () => {
    const state = prototypeReducer(
      stateFor('my', { toast: { kind: 'info', message: '이전 알림' } }),
      { type: 'action.submitted', actionId: 'call' },
    )

    expect(state).toMatchObject({ demoPhase: 'pending', pendingAction: 'call', toast: undefined })
  })

  it('pending 중에는 두 번째 제출을 무시한다(중복 입력 잠금)', () => {
    const pending = prototypeReducer(stateFor('my'), { type: 'action.submitted', actionId: 'raise' })
    const again = prototypeReducer(pending, { type: 'action.submitted', actionId: 'fold' })

    expect(again).toBe(pending)
    expect(again.pendingAction).toBe('raise')
  })

  it('pending일 때만 확정할 수 있다', () => {
    const idle = stateFor('my')
    expect(prototypeReducer(idle, { type: 'action.confirmed' })).toBe(idle)

    const pending = prototypeReducer(idle, { type: 'action.submitted', actionId: 'raise' })
    expect(prototypeReducer(pending, { type: 'action.confirmed' }).demoPhase).toBe('settled')
  })
})

describe('scenario.changed', () => {
  it('진행 중이던 목 흐름과 열린 메뉴·다이얼로그를 초기화한다', () => {
    const busy = stateFor('my', {
      demoPhase: 'settled',
      pendingAction: 'raise',
      leaveDialogOpen: true,
      menuOpen: true,
      endSessionDialogOpen: true,
      panelTab: 'participants',
    })
    const state = prototypeReducer(busy, { type: 'scenario.changed', scenarioKey: 'fold', defaultBet: 0 })

    expect(state).toMatchObject({
      scenarioKey: 'fold',
      demoPhase: 'idle',
      pendingAction: undefined,
      leaveDialogOpen: false,
      menuOpen: false,
      endSessionDialogOpen: false,
      toast: { kind: 'info', message: '지훈 폴드' },
    })
    // 사용자가 고른 탭은 유지한다.
    expect(state.panelTab).toBe('participants')
  })
})

describe('패널·메뉴·다이얼로그', () => {
  it('탭을 바꾸고 패널을 접었다 펼친다', () => {
    let state = prototypeReducer(stateFor('opp'), { type: 'panel.tabChanged', tab: 'participants' })
    expect(state.panelTab).toBe('participants')

    state = prototypeReducer(state, { type: 'panel.collapsedChanged' })
    expect(state.panelCollapsed).toBe(true)
    state = prototypeReducer(state, { type: 'panel.collapsedChanged' })
    expect(state.panelCollapsed).toBe(false)
  })

  it('메뉴에서 세션 종료나 나가기를 열면 메뉴를 닫는다', () => {
    const open = prototypeReducer(stateFor('opp'), { type: 'menu.toggled' })
    expect(open.menuOpen).toBe(true)

    const ending = prototypeReducer(open, { type: 'endSession.opened' })
    expect(ending).toMatchObject({ menuOpen: false, endSessionDialogOpen: true })
    expect(prototypeReducer(ending, { type: 'endSession.closed' }).endSessionDialogOpen).toBe(false)

    const leaving = prototypeReducer(open, { type: 'leave.opened' })
    expect(leaving).toMatchObject({ menuOpen: false, leaveDialogOpen: true })
    expect(prototypeReducer(leaving, { type: 'leave.closed' }).leaveDialogOpen).toBe(false)
  })

  it('초대 링크를 복사하면 성공 토스트를 띄우고, 닫으면 지운다', () => {
    const copied = prototypeReducer(stateFor('opp'), { type: 'invite.copied' })
    expect(copied.toast).toEqual({ kind: 'success', message: '초대 링크를 복사했습니다' })
    expect(prototypeReducer(copied, { type: 'toast.dismissed' }).toast).toBeUndefined()
  })
})
