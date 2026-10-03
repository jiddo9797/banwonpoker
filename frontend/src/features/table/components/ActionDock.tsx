import { useState } from 'react'
import { streetBetTotal } from '../model'
import type { ActionOption, DemoPhase, TableSnapshot } from '../model'
import { formatChips } from '../../../shared/format'

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
  const hasBetControl = snapshot.actions.find((action) => action.id === 'raise')?.enabled ?? false
  const isPending = phase === 'pending' || snapshot.key === 'pending'

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
              콜 {formatChips(snapshot.callAmount)} · 최소 레이즈 {formatChips(snapshot.minRaise)}
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
                  commitDraft()
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
              {formatChips(snapshot.minRaise)}부터 {formatChips(snapshot.maxRaise)}까지 입력할 수 있습니다
            </span>
          </div>
        </div>
      ) : null}

      <div className="action-context">
        {isPending ? '서버 확인을 기다리는 중 · 중복 입력 잠금' : snapshot.actionHint}
      </div>

      <div className="action-grid">
        {snapshot.actions.map((action) => {
          const enabled = action.enabled && !isPending
          const isSubmitted = isPending && action.id === (pendingAction ?? 'raise')
          const label = isSubmitted
            ? '처리 중…'
            : action.id === 'raise' && action.enabled
              ? `${action.label} ${formatChips(selectedBetAmount)}`
              : action.label
          const detail = isSubmitted
            ? action.id === 'raise'
              ? `${action.label === '처리 중…' ? '레이즈' : action.label} ${formatChips(selectedBetAmount)}`
              : action.label
            : action.detail

          return (
            <button
              aria-disabled={!enabled}
              className={`action-button action-button--${action.tone} ${isSubmitted ? 'is-pending' : ''}`}
              key={action.id}
              onClick={() => {
                if (enabled) onAction(action.id)
              }}
              type="button"
            >
              <strong>{label}</strong>
              <span>{detail}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
