import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { streetBetTotal } from '../model'
import type { ActionOption, DemoPhase, TableSnapshot } from '../model'
import { formatChips } from '../../../shared/format'

/** 액션 단축키. 한/영 상태와 상관없이 같은 자리의 키로 동작하도록 key가 아니라 code로 본다. */
const hotkeys: Record<string, ActionOption['id']> = { KeyC: 'call', KeyK: 'check', KeyR: 'raise', KeyF: 'fold' }
const hotkeyLabels: Record<ActionOption['id'], string> = { call: 'C', check: 'K', raise: 'R', fold: 'F' }
/** 버튼 네 자리는 이 순서로 고정한다(왼쪽부터 폴드 · 체크 · 콜 · 레이즈). */
const ACTION_ORDER: Array<ActionOption['id']> = ['fold', 'check', 'call', 'raise']

/** 글자를 입력하는 칸이면 단축키를 쓰지 않는다(채팅·금액 입력). 슬라이더·버튼에 포커스가 있을 때는 쓴다. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(target.type)
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step
}

interface ActionDockProps {
  snapshot: TableSnapshot
  selectedBetAmount: number
  phase: DemoPhase
  pendingAction?: ActionOption['id']
  onBetAmountChange: (amount: number) => void
  onAction: (action: ActionOption['id']) => void
  /** 슬라이더 간격과 빠른 선택 반올림 단위. 기본 50 */
  betStep?: number
}

export function ActionDock({
  snapshot,
  selectedBetAmount,
  phase,
  pendingAction,
  onBetAmountChange,
  onAction,
  betStep = 50,
}: ActionDockProps) {
  // ½팟·팟은 이번 스트리트에 낸 칩까지 더한 팟으로 계산한다.
  const potTotal = snapshot.pots.reduce((sum, pot) => sum + pot.amount, 0) + streetBetTotal(snapshot)
  // 빠른 선택은 최소 레이즈 이상, 올인 금액 이하로 맞춘다.
  const clampBet = (value: number) => Math.min(snapshot.maxRaise, Math.max(snapshot.minRaise, value))
  const quickBets = [
    { label: '최소', value: snapshot.minRaise },
    { label: '½팟', value: clampBet(roundToStep(potTotal * 0.5, betStep)) },
    { label: '¾팟', value: clampBet(roundToStep(potTotal * 0.75, betStep)) },
    { label: '팟', value: clampBet(roundToStep(potTotal, betStep)) },
    { label: '올인', value: snapshot.maxRaise },
  ]
  // −/+ 버튼과 ↑/↓ 키는 한 번에 지금 빅 블라인드만큼 바꾼다.
  const nudgeUnit = Math.max(1, snapshot.bigBlind)
  const nudgeLabel = formatChips(nudgeUnit)
  const canDecrease = selectedBetAmount > snapshot.minRaise
  const canIncrease = selectedBetAmount < snapshot.maxRaise
  const nudge = (from: number, direction: 1 | -1) => {
    const amount = clampBet(from + direction * nudgeUnit)
    onBetAmountChange(amount)
    return amount
  }
  const fillPercent = snapshot.maxRaise > snapshot.minRaise ? ((selectedBetAmount - snapshot.minRaise) / (snapshot.maxRaise - snapshot.minRaise)) * 100 : 100
  const hasBetControl = snapshot.actions.find((action) => action.id === 'raise')?.enabled ?? false
  const isPending = phase === 'pending' || snapshot.key === 'pending'
  const canAct = (id: ActionOption['id']) => !isPending && (snapshot.actions.find((action) => action.id === id)?.enabled ?? false)

  // 키보드 단축키: C 콜, K 체크, R 레이즈(지금 금액), F 폴드
  const latest = useRef({ canAct, onAction })
  latest.current = { canAct, onAction }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target)) return
      // 확인창이나 메뉴가 열려 있으면 테이블 액션을 하지 않는다.
      if (document.querySelector('[role="dialog"], .menu-popover')) return
      const id = hotkeys[event.code]
      if (!id || !latest.current.canAct(id)) return
      event.preventDefault()
      latest.current.onAction(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 직접 입력: 입력하는 동안은 적은 그대로 두고, 칸을 벗어나거나 Enter를 누르면 금액을 정한다(범위 밖이면 가장 가까운 값으로 맞춘다).
  const [draft, setDraft] = useState<string | null>(null)
  const commitDraft = () => {
    if (draft === null) return
    const amount = Number(draft.replace(/[^\d]/g, ''))
    if (draft.trim() !== '' && Number.isFinite(amount) && amount > 0) onBetAmountChange(amount)
    setDraft(null)
  }

  return (
    <section aria-label="포커 액션" className="action-dock">
      {hasBetControl ? (
        <div className="bet-control">
          <div className="bet-control-header">
            <span>
              콜 <b>{formatChips(snapshot.callAmount)}</b> · 최소 레이즈 <b>{formatChips(snapshot.minRaise)}</b>
            </span>
            <div aria-label="빠른 베팅 금액" className="quick-bets" role="group">
              {quickBets.map((bet) => (
                <button
                  aria-pressed={selectedBetAmount === bet.value}
                  className={selectedBetAmount === bet.value ? 'is-selected' : ''}
                  key={bet.label}
                  onClick={() => onBetAmountChange(bet.value)}
                  type="button"
                >
                  {bet.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bet-slider-row">
            <input
              aria-label="레이즈 총액"
              aria-valuetext={`${formatChips(selectedBetAmount)} 칩`}
              max={snapshot.maxRaise}
              min={snapshot.minRaise}
              onChange={(event) => onBetAmountChange(Number(event.target.value))}
              step={betStep}
              style={{ '--fill': `${fillPercent}%` } as CSSProperties}
              type="range"
              value={selectedBetAmount}
            />
            <button
              aria-disabled={!canDecrease}
              aria-label={`${nudgeLabel} 내리기`}
              className="bet-nudge"
              onClick={() => {
                if (canDecrease) nudge(selectedBetAmount, -1)
              }}
              title={`${nudgeLabel} 내리기`}
              type="button"
            >
              −
            </button>
            <input
              aria-describedby="bet-amount-range"
              aria-label="베팅 금액 직접 입력"
              className="bet-amount-input"
              enterKeyHint="done"
              inputMode="numeric"
              onBlur={commitDraft}
              onChange={(event) => setDraft(event.target.value.replace(/[^\d,]/g, ''))}
              onFocus={(event) => {
                setDraft(String(selectedBetAmount))
                event.target.select()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (event.nativeEvent.isComposing) return
                  // 첫 Enter는 입력한 금액을 정하고, 정한 상태에서 한 번 더 누르면 레이즈한다.
                  if (draft !== null) commitDraft()
                  else if (canAct('raise')) onAction('raise')
                } else if (event.key === 'Escape') {
                  setDraft(null)
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  const typed = draft === null ? NaN : Number(draft.replace(/[^\d]/g, ''))
                  const from = Number.isFinite(typed) && typed > 0 ? typed : selectedBetAmount
                  const amount = nudge(from, event.key === 'ArrowUp' ? 1 : -1)
                  if (draft !== null) setDraft(String(amount))
                }
              }}
              type="text"
              value={draft ?? formatChips(selectedBetAmount)}
            />
            <button
              aria-disabled={!canIncrease}
              aria-label={`${nudgeLabel} 올리기`}
              className="bet-nudge"
              onClick={() => {
                if (canIncrease) nudge(selectedBetAmount, 1)
              }}
              title={`${nudgeLabel} 올리기`}
              type="button"
            >
              +
            </button>
            <span className="visually-hidden" id="bet-amount-range">
              {formatChips(snapshot.minRaise)}부터 {formatChips(snapshot.maxRaise)}까지 입력할 수 있습니다. 금액을 정한 뒤 Enter를 한 번
              더 누르면 레이즈합니다
            </span>
          </div>
        </div>
      ) : null}

      <div className="action-context">
        {isPending ? '서버 확인을 기다리는 중 · 중복 입력 잠금' : snapshot.actionHint}
      </div>

      <div className="action-grid">
        {[...snapshot.actions].sort((a, b) => ACTION_ORDER.indexOf(a.id) - ACTION_ORDER.indexOf(b.id)).map((action) => {
          const enabled = action.enabled && !isPending
          const isSubmitted = isPending && action.id === (pendingAction ?? 'raise')
          // 레이즈는 이름 아래에 정한 금액을 크게 쓴다. 보조기술에는 `레이즈 2,400`처럼 함께 읽힌다.
          const raiseAmount = action.id === 'raise' && action.enabled && !isSubmitted ? formatChips(selectedBetAmount) : null
          const label = isSubmitted ? '처리 중…' : action.label
          const detail = isSubmitted
            ? action.id === 'raise'
              ? `${action.label === '처리 중…' ? '레이즈' : action.label} ${formatChips(selectedBetAmount)}`
              : action.label
            : (raiseAmount ?? action.detail)

          return (
            <button
              aria-disabled={!enabled}
              aria-keyshortcuts={hotkeyLabels[action.id]}
              aria-label={raiseAmount ? `${label} ${raiseAmount}` : undefined}
              className={`action-button action-button--${action.tone} ${isSubmitted ? 'is-pending' : ''}`}
              key={action.id}
              onClick={() => {
                if (enabled) onAction(action.id)
              }}
              type="button"
            >
              <strong>{label}</strong>
              <span className={raiseAmount ? 'action-amount' : undefined}>{detail}</span>
              <kbd aria-hidden="true" className="action-key">
                {hotkeyLabels[action.id]}
              </kbd>
            </button>
          )
        })}
      </div>
    </section>
  )
}
