import {
  CheckmarkCircle20Filled,
  Dismiss20Regular,
  Info20Regular,
  Warning20Filled,
} from '@fluentui/react-icons'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { isCompactViewport } from '../../shared/CanvasStage'
import { Dialog } from '../../shared/Dialog'
import { formatChips } from '../../shared/format'
import { RoomRules } from '../room/RoomRules'
import { defaultRoomSettings, nextLevelNote } from '../room/settings'
import type { RoomSettings } from '../room/settings'
import { ActionDock } from './components/ActionDock'
import { GameTable } from './components/GameTable'
import { SidePanel } from './components/SidePanel'
import { TableChrome } from './components/TableChrome'
import { chatFixture, getTableSnapshot } from './fixtures'
import type { ActionOption, ChatLine, ScenarioKey, TableSnapshot, ToastMessage } from './model'
import { createInitialPrototypeState, prototypeReducer } from './reducer'

export const PENDING_CONFIRM_DELAY_MS = 1200

export function settledSnapshot(snapshot: TableSnapshot, amount: number, actionId?: ActionOption['id']): TableSnapshot {
  const actionLabel = actionId === 'fold' ? '폴드' : actionId === 'call' ? '콜' : actionId === 'check' ? '체크' : '레이즈'
  const actionLog = actionId === 'raise' ? `내가 ${formatChips(amount)}으로 레이즈` : `내가 ${actionLabel}`

  return {
    ...snapshot,
    seats: snapshot.seats.map((seat) =>
      seat.id === 'eugene'
        ? { ...seat, isTurn: true, remainingSeconds: 59 }
        : { ...seat, isTurn: false, remainingSeconds: undefined },
    ),
    heroBet: actionId === 'raise' ? amount : snapshot.heroBet,
    heroStack: actionId === 'raise' ? Math.max(0, snapshot.heroStack - amount) : snapshot.heroStack,
    recordingState: 'hidden',
    heroRemainingSeconds: undefined,
    actionHint: '유진 차례를 기다리는 중',
    actions: getTableSnapshot('opp').actions,
    logs: [actionLog, ...snapshot.logs],
    toast: {
      kind: 'success',
      message: `${actionLabel} 액션이 확정되었습니다`,
    },
  }
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
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

export interface ConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function LeaveDialog({ open, onCancel, onConfirm }: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      description={<p>이번 핸드는 폴드 처리됩니다. 남은 칩은 세션 기록에 그대로 남습니다.</p>}
      initialFocusRef={cancelButtonRef}
      onClose={onCancel}
      open={open}
      title="테이블에서 나갈까요?"
    >
      <div className="dialog-actions">
        <button onClick={onCancel} ref={cancelButtonRef} type="button">
          계속 플레이
        </button>
        <button className="danger-button" onClick={onConfirm} type="button">
          나가기
        </button>
      </div>
    </Dialog>
  )
}

export function SettingsDialog({ open, room, onClose }: { open: boolean; room: RoomSettings; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      className="settings-dialog"
      description={<p>게임 중에는 설정을 바꿀 수 없습니다. 규칙은 방장이 대기실에서 정합니다.</p>}
      initialFocusRef={closeRef}
      onClose={onClose}
      open={open}
      title={`방 설정 · ${room.name}`}
    >
      <div className="settings-dialog-body">
        <RoomRules settings={room} />
      </div>
      <div className="dialog-actions">
        <button onClick={onClose} ref={closeRef} type="button">
          닫기
        </button>
      </div>
    </Dialog>
  )
}

export function EndSessionDialog({ open, onCancel, onConfirm }: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      description={
        <p>
          진행 중인 핸드는 무효 처리되고, 참가자 전원이 세션 요약과 복기 화면으로 이동합니다. 종료한 세션은 다시 열 수
          없습니다.
        </p>
      }
      initialFocusRef={cancelButtonRef}
      onClose={onCancel}
      open={open}
      title="세션을 종료할까요?"
    >
      <div className="dialog-actions">
        <button onClick={onCancel} ref={cancelButtonRef} type="button">
          계속 플레이
        </button>
        <button className="danger-button" onClick={onConfirm} type="button">
          세션 종료
        </button>
      </div>
    </Dialog>
  )
}

interface TablePrototypeProps {
  scenarioKey: ScenarioKey
  /** 방장이 정한 규칙. 테이블에서는 읽기만 한다. */
  room?: RoomSettings
  isHost?: boolean
  hostName?: string
  /** `음성 없이 참여`를 선택했는지. 내 좌석의 기록 상태 문구만 바뀐다. */
  voiceless?: boolean
  /** 게임 중에 음성 기록을 끄거나 켠다 */
  onVoicelessChange?: (voiceless: boolean) => void
  onLeave?: () => void
  onEndSession?: () => void
}

export function TablePrototype({
  scenarioKey,
  room = defaultRoomSettings,
  isHost = true,
  hostName = '나',
  voiceless = false,
  onVoicelessChange,
  onLeave,
  onEndSession,
}: TablePrototypeProps) {
  const [state, dispatch] = useReducer(
    prototypeReducer,
    undefined,
    () => createInitialPrototypeState(scenarioKey, isCompactViewport()),
  )
  const [chatMessages, setChatMessages] = useState<ChatLine[]>(chatFixture)

  // 개발 도구나 URL로 시나리오가 바뀌면 목 상태를 새 시나리오로 맞춘다.
  if (state.scenarioKey !== scenarioKey) {
    dispatch({
      type: 'scenario.changed',
      scenarioKey,
      defaultBet: getTableSnapshot(scenarioKey).selectedBetAmount,
    })
  }

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

  // 헤더의 블라인드는 방장이 정한 첫 레벨을 따른다. 베팅 금액 같은 나머지 값은 목 데이터다.
  const headerSnapshot = {
    ...snapshot,
    smallBlind: room.levels[0]?.smallBlind ?? snapshot.smallBlind,
    bigBlind: room.levels[0]?.bigBlind ?? snapshot.bigBlind,
  }

  const activeToast = state.demoPhase === 'settled' ? snapshot.toast : state.toast

  useEffect(() => {
    if (state.demoPhase !== 'pending' || state.scenarioKey === 'pending') return
    const timer = window.setTimeout(() => dispatch({ type: 'action.confirmed' }), PENDING_CONFIRM_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [state.demoPhase, state.scenarioKey])

  const invite = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.origin)
    } catch {
      // 목 프로토타입에서는 클립보드 권한이 없어도 같은 안내를 보여준다.
    } finally {
      dispatch({ type: 'invite.copied' })
    }
  }

  return (
    <>
      <TableChrome
        blindNote={nextLevelNote(room, 12)}
        hostName={hostName}
        isHost={isHost}
        menuOpen={state.menuOpen}
        onCloseMenu={() => dispatch({ type: 'menu.closed' })}
        onEndSession={() => dispatch({ type: 'endSession.opened' })}
        onInvite={invite}
        onLeave={() => dispatch({ type: 'leave.opened' })}
        onOpenSettings={() => dispatch({ type: 'settings.opened' })}
        onToggleMenu={() => dispatch({ type: 'menu.toggled' })}
        snapshot={headerSnapshot}
      />
      <GameTable
        onToggleVoice={onVoicelessChange ? () => onVoicelessChange(!voiceless) : undefined}
        snapshot={snapshot}
        voiceless={voiceless}
      />
      <SidePanel
        activeTab={state.panelTab}
        chatMessages={chatMessages}
        collapsed={state.panelCollapsed}
        onSendChat={(text) =>
          setChatMessages((messages) => [...messages, { id: `local-${messages.length + 1}`, name: '나', text, mine: true }])
        }
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
      {activeToast ? <Toast onDismiss={() => dispatch({ type: 'toast.dismissed' })} toast={activeToast} /> : null}
      <LeaveDialog
        onCancel={() => dispatch({ type: 'leave.closed' })}
        onConfirm={() => {
          dispatch({ type: 'leave.closed' })
          onLeave?.()
        }}
        open={state.leaveDialogOpen}
      />
      <SettingsDialog
        onClose={() => dispatch({ type: 'settings.closed' })}
        open={state.settingsDialogOpen}
        room={room}
      />
      <EndSessionDialog
        onCancel={() => dispatch({ type: 'endSession.closed' })}
        onConfirm={() => {
          dispatch({ type: 'endSession.closed' })
          onEndSession?.()
        }}
        open={state.endSessionDialogOpen}
      />
    </>
  )
}
