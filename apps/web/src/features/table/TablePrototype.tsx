import {
  CheckmarkCircle20Filled,
  Dismiss20Regular,
  Info20Regular,
  Warning20Filled,
} from '@fluentui/react-icons'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { GameTable } from './components/GameTable'
import { SidePanel } from './components/SidePanel'
import { TableChrome } from './components/TableChrome'
import { getTableSnapshot } from './fixtures'
import { isScenarioKey } from './model'
import type { ActionOption, ScenarioKey, TableSnapshot, ToastMessage } from './model'
import { createInitialPrototypeState, prototypeReducer } from './reducer'

const CANVAS_WIDTH = 1440
const CANVAS_HEIGHT = 900

function readScenarioFromUrl(): ScenarioKey {
  if (typeof window === 'undefined') return 'opp'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return isScenarioKey(value) ? value : 'opp'
}

function getCanvasScale() {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT, 1)
}

function useCanvasScale() {
  const [scale, setScale] = useState(getCanvasScale)

  useEffect(() => {
    const updateScale = () => setScale(getCanvasScale())
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return scale
}

function settledSnapshot(snapshot: TableSnapshot, amount: number, actionId?: ActionOption['id']) {
  const actionLabel = actionId === 'fold' ? '폴드' : actionId === 'call' ? '콜' : actionId === 'check' ? '체크' : '레이즈'
  const actionLog = actionId === 'raise' ? `내가 ${amount.toLocaleString('ko-KR')}으로 레이즈` : `내가 ${actionLabel}`

  return {
    ...snapshot,
    seats: snapshot.seats.map((seat) =>
      seat.id === 'eugene'
        ? { ...seat, isTurn: true, remainingSeconds: 59 }
        : { ...seat, isTurn: false, remainingSeconds: undefined },
    ),
    heroBet: actionId === 'raise' ? amount : snapshot.heroBet,
    heroStack: actionId === 'raise' ? Math.max(0, snapshot.heroStack - amount) : snapshot.heroStack,
    recordingState: 'hidden' as const,
    heroRemainingSeconds: undefined,
    actionHint: '유진 차례를 기다리는 중',
    actions: getTableSnapshot('opp').actions,
    logs: [actionLog, ...snapshot.logs],
    toast: {
      kind: 'success' as const,
      message: `${actionLabel} 액션이 확정되었습니다`,
    },
  }
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const Icon = toast.kind === 'warning' ? Warning20Filled : toast.kind === 'success' ? CheckmarkCircle20Filled : Info20Regular

  return (
    <div
      className={`table-toast table-toast--${toast.kind}`}
      role={toast.kind === 'warning' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" />
      <span>{toast.message}</span>
      <button aria-label="알림 닫기" onClick={onDismiss} type="button">
        <Dismiss20Regular aria-hidden="true" />
      </button>
    </div>
  )
}

function LeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop">
      <section aria-describedby="leave-description" aria-labelledby="leave-title" className="leave-dialog" role="dialog">
        <h2 id="leave-title">테이블에서 나갈까요?</h2>
        <p id="leave-description">
          진행 중인 핸드는 폴드 처리됩니다. 이 화면은 프로토타입이므로 실제 퇴장이나 게임 상태 변경은 발생하지 않습니다.
        </p>
        <div className="dialog-actions">
          <button onClick={onClose} ref={cancelButtonRef} type="button">
            계속 플레이
          </button>
          <button className="danger-button" onClick={onClose} type="button">
            나가기
          </button>
        </div>
      </section>
    </div>
  )
}

export function TablePrototype() {
  const initialScenario = useMemo(readScenarioFromUrl, [])
  const [state, dispatch] = useReducer(
    prototypeReducer,
    createInitialPrototypeState(
      initialScenario,
      typeof window !== 'undefined' && (window.innerWidth <= 1280 || window.innerHeight <= 720),
    ),
  )
  const scale = useCanvasScale()
  const baseSnapshot = useMemo(() => getTableSnapshot(state.scenarioKey), [state.scenarioKey])

  const snapshot = useMemo(() => {
    if (state.demoPhase === 'pending' && state.scenarioKey !== 'pending') {
      const pending = getTableSnapshot('pending')
      return {
        ...pending,
        heroBet: baseSnapshot.heroBet,
        selectedBetAmount: state.selectedBetAmount,
      }
    }

    if (state.demoPhase === 'settled') {
      return settledSnapshot(baseSnapshot, state.selectedBetAmount, state.pendingAction)
    }

    return baseSnapshot
  }, [baseSnapshot, state.demoPhase, state.pendingAction, state.scenarioKey, state.selectedBetAmount])

  const activeToast = state.demoPhase === 'settled' ? snapshot.toast : state.toast

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('scenario', state.scenarioKey)
    window.history.replaceState(null, '', url)
  }, [state.scenarioKey])

  useEffect(() => {
    if (state.demoPhase !== 'pending' || state.scenarioKey === 'pending') return
    const timer = window.setTimeout(() => dispatch({ type: 'action.confirmed' }), 1200)
    return () => window.clearTimeout(timer)
  }, [state.demoPhase, state.scenarioKey])

  const changeScenario = (scenarioKey: ScenarioKey) => {
    const nextSnapshot = getTableSnapshot(scenarioKey)
    dispatch({
      type: 'scenario.changed',
      scenarioKey,
      defaultBet: nextSnapshot.selectedBetAmount,
    })
  }

  const invite = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href)
    } finally {
      dispatch({ type: 'invite.copied' })
    }
  }

  return (
    <div className="prototype-viewport">
      <div
        className="canvas-stage"
        style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}
      >
        <div className="table-canvas" style={{ transform: `scale(${scale})` }}>
          <TableChrome
            onInvite={invite}
            onLeave={() => dispatch({ type: 'leave.opened' })}
            onScenarioChange={changeScenario}
            scenarioKey={state.scenarioKey}
            snapshot={snapshot}
          />
          <GameTable snapshot={snapshot} />
          <SidePanel
            activeTab={state.panelTab}
            collapsed={state.panelCollapsed}
            onTabChange={(tab) => dispatch({ type: 'panel.tabChanged', tab })}
            onToggleCollapsed={() => dispatch({ type: 'panel.collapsedChanged' })}
            snapshot={snapshot}
          />
          <ActionDock
            onAction={(actionId) => dispatch({ type: 'action.submitted', actionId })}
            onBetAmountChange={(amount) => dispatch({ type: 'bet.amountChanged', amount })}
            pendingAction={state.pendingAction}
            phase={state.demoPhase}
            selectedBetAmount={state.selectedBetAmount}
            snapshot={snapshot}
          />
          {activeToast ? (
            <Toast onDismiss={() => dispatch({ type: 'toast.dismissed' })} toast={activeToast} />
          ) : null}
          <LeaveDialog onClose={() => dispatch({ type: 'leave.closed' })} open={state.leaveDialogOpen} />
        </div>
      </div>
      <p className="small-screen-note">이 프로토타입은 최소 1280×720 PC 화면을 기준으로 설계되었습니다.</p>
    </div>
  )
}
