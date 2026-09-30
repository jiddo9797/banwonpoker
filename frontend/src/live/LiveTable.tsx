import { useState } from 'react'
import type { ClientState } from '@banwonpoker/server/protocol'
import { isCompactViewport } from '../shared/CanvasStage'
import { ActionDock } from '../features/table/components/ActionDock'
import { GameTable } from '../features/table/components/GameTable'
import { SidePanel } from '../features/table/components/SidePanel'
import { TableChrome } from '../features/table/components/TableChrome'
import type { PanelTab, ToastMessage } from '../features/table/model'
import { EndSessionDialog, LeaveDialog, SettingsDialog, Toast } from '../features/table/TablePrototype'
import { blindNoteOf, toPlayerAction, toTableSnapshot } from './adapt'
import type { ActionSlot, LiveClient, LiveSnapshot } from './client'
import { useServerNow } from './hooks'
import { inviteUrlFor } from './LivePrep'
import { useTurnRecording } from './useTurnRecording'

interface LiveTableProps {
  client: LiveClient
  snapshot: LiveSnapshot
  state: ClientState
}

/** 실제 게임 테이블. 서버 상태를 기존 테이블 부품에 맞춰 그린다. */
export function LiveTable({ client, snapshot, state }: LiveTableProps) {
  const now = useServerNow(snapshot.clockOffset)
  const recordingState = useTurnRecording({ client, state, clockOffset: snapshot.clockOffset, pending: snapshot.pending !== null })
  const table = { ...toTableSnapshot(state, snapshot.events, { now, status: snapshot.status }), recordingState }
  const game = state.game!
  const legal = game.view.legal
  const step = Math.max(1, game.blinds.level.smallBlind)

  const [panelTab, setPanelTab] = useState<PanelTab>('log')
  const [panelCollapsed, setPanelCollapsed] = useState(isCompactViewport)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<'leave' | 'end' | 'settings' | null>(null)
  const [notice, setNotice] = useState<ToastMessage>()

  // 새 차례가 올 때마다 베팅 금액을 최소 금액으로 되돌린다.
  const turnKey = `${game.view.handNumber}:${game.turn?.playerId}:${game.turn?.deadline}`
  const [bet, setBet] = useState(legal?.minAmount ?? 0)
  const [betKey, setBetKey] = useState(turnKey)
  if (betKey !== turnKey) {
    setBetKey(turnKey)
    setBet(legal?.minAmount ?? 0)
  }
  const clampBet = (amount: number) =>
    legal ? Math.min(legal.maxAmount, Math.max(legal.minAmount, Math.round(amount))) : 0

  // 서버가 액션을 거절하면(최소 레이즈 등) 이유를 토스트로 알린다.
  const error = snapshot.lastError
  const [dismissedError, setDismissedError] = useState(error?.id)
  const errorToast: ToastMessage | undefined =
    error && error.id !== dismissedError && (error.requestType === 'action' || error.requestType === 'session.end')
      ? { kind: 'warning', message: error.error.message }
      : undefined
  const toast = errorToast ?? notice

  const onAction = (slot: ActionSlot) => {
    if (!legal) return
    setDismissedError(error?.id)
    client.act(slot, toPlayerAction(slot, legal, clampBet(bet)))
  }

  const invite = async () => {
    try {
      await navigator.clipboard?.writeText(inviteUrlFor(state.room.code))
    } catch {
      // 권한이 없어도 같은 안내를 보여준다.
    }
    setNotice({ kind: 'success', message: '초대 링크를 복사했습니다' })
  }

  const host = state.room.participants.find((participant) => participant.isHost)
  const me = game.view.seats.find((seat) => seat.id === state.you.playerId)

  return (
    <>
      <TableChrome
        blindNote={blindNoteOf(state, now)}
        hostName={host?.nickname ?? ''}
        isHost={state.you.isHost}
        menuOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
        onEndSession={() => {
          setMenuOpen(false)
          setDialog('end')
        }}
        onInvite={invite}
        onLeave={() => {
          setMenuOpen(false)
          setDialog('leave')
        }}
        onOpenSettings={() => setDialog('settings')}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        snapshot={table}
      />
      <GameTable
        heroLabel={me && me.status === 'active' ? '나' : '관전 중'}
        snapshot={table}
        voiceless={state.you.voiceless}
      />
      <SidePanel
        activeTab={panelTab}
        collapsed={panelCollapsed}
        onTabChange={setPanelTab}
        onToggleCollapsed={() => setPanelCollapsed((collapsed) => !collapsed)}
        snapshot={table}
      />
      <ActionDock
        betStep={step}
        onAction={onAction}
        onBetAmountChange={(amount) => setBet(clampBet(amount))}
        pendingAction={snapshot.pending?.slot}
        phase={snapshot.pending ? 'pending' : 'idle'}
        selectedBetAmount={legal ? clampBet(bet) : 0}
        snapshot={table}
      />
      {toast ? (
        <Toast
          onDismiss={() => {
            setDismissedError(error?.id)
            setNotice(undefined)
          }}
          toast={toast}
        />
      ) : null}
      <LeaveDialog onCancel={() => setDialog(null)} onConfirm={() => client.leave()} open={dialog === 'leave'} />
      <EndSessionDialog
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          client.send({ type: 'session.end' })
        }}
        open={dialog === 'end'}
      />
      <SettingsDialog onClose={() => setDialog(null)} open={dialog === 'settings'} room={state.room.settings} />
    </>
  )
}
