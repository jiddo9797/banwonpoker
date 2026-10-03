import { getTableSnapshot } from './fixtures'
import type { PrototypeAction, PrototypeState, ScenarioKey, TableSnapshot } from './model'

function normalizeBetAmount(amount: number, snapshot: TableSnapshot): number {
  if (!Number.isFinite(amount)) {
    return snapshot.selectedBetAmount
  }

  const boundedAmount = Math.min(snapshot.maxRaise, Math.max(snapshot.minRaise, amount))
  return Math.round(boundedAmount / 50) * 50
}

export function createInitialPrototypeState(
  scenarioKey: ScenarioKey = 'opp',
  isCompactViewport = false,
  defaultBet?: number,
): PrototypeState {
  const snapshot = getTableSnapshot(scenarioKey)

  return {
    scenarioKey,
    panelTab: 'chat',
    panelCollapsed: isCompactViewport,
    selectedBetAmount: normalizeBetAmount(
      defaultBet ?? snapshot.selectedBetAmount,
      snapshot,
    ),
    demoPhase: scenarioKey === 'pending' ? 'pending' : 'idle',
    pendingAction: scenarioKey === 'pending' ? 'raise' : undefined,
    toast: snapshot.toast,
    leaveDialogOpen: false,
    menuOpen: false,
    endSessionDialogOpen: false,
    settingsDialogOpen: false,
  }
}

export function prototypeReducer(
  state: PrototypeState,
  action: PrototypeAction,
): PrototypeState {
  switch (action.type) {
    case 'scenario.changed': {
      const snapshot = getTableSnapshot(action.scenarioKey)

      return {
        ...state,
        scenarioKey: action.scenarioKey,
        selectedBetAmount: normalizeBetAmount(action.defaultBet, snapshot),
        demoPhase: action.scenarioKey === 'pending' ? 'pending' : 'idle',
        pendingAction: action.scenarioKey === 'pending' ? 'raise' : undefined,
        toast: snapshot.toast,
        leaveDialogOpen: false,
        menuOpen: false,
        endSessionDialogOpen: false,
        settingsDialogOpen: false,
      }
    }

    case 'panel.tabChanged':
      return {
        ...state,
        panelTab: action.tab,
      }

    case 'panel.collapsedChanged':
      return {
        ...state,
        panelCollapsed: !state.panelCollapsed,
      }

    case 'bet.amountChanged': {
      const snapshot = getTableSnapshot(state.scenarioKey)

      return {
        ...state,
        selectedBetAmount: normalizeBetAmount(action.amount, snapshot),
      }
    }

    case 'action.submitted':
      if (state.demoPhase === 'pending') {
        return state
      }

      return {
        ...state,
        demoPhase: 'pending',
        pendingAction: action.actionId,
        toast: undefined,
      }

    case 'action.confirmed':
      if (state.demoPhase !== 'pending') {
        return state
      }

      return {
        ...state,
        demoPhase: 'settled',
      }

    case 'invite.copied':
      return {
        ...state,
        toast: {
          kind: 'success',
          message: '초대 링크를 복사했습니다',
        },
      }

    case 'toast.dismissed':
      return {
        ...state,
        toast: undefined,
      }

    case 'leave.opened':
      return {
        ...state,
        menuOpen: false,
        leaveDialogOpen: true,
      }

    case 'leave.closed':
      return {
        ...state,
        leaveDialogOpen: false,
      }

    case 'menu.toggled':
      return {
        ...state,
        menuOpen: !state.menuOpen,
      }

    case 'menu.closed':
      return {
        ...state,
        menuOpen: false,
      }

    case 'endSession.opened':
      return {
        ...state,
        menuOpen: false,
        endSessionDialogOpen: true,
      }

    case 'endSession.closed':
      return {
        ...state,
        endSessionDialogOpen: false,
      }

    case 'settings.opened':
      return {
        ...state,
        menuOpen: false,
        settingsDialogOpen: true,
      }

    case 'settings.closed':
      return {
        ...state,
        settingsDialogOpen: false,
      }
  }
}
