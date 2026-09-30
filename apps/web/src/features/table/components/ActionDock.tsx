import type { ActionOption, DemoPhase, TableSnapshot } from '../model'

function formatChips(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
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
}

export function ActionDock({
  snapshot,
  selectedBetAmount,
  phase,
  pendingAction,
  onBetAmountChange,
  onAction,
}: ActionDockProps) {
  const potTotal = snapshot.pots.reduce((sum, pot) => sum + pot.amount, 0)
  const quickBets = [
    { label: '최소', value: snapshot.minRaise },
    { label: '½팟', value: Math.max(snapshot.minRaise, roundToStep(potTotal * 0.5, 50)) },
    { label: '¾팟', value: Math.max(snapshot.minRaise, roundToStep(potTotal * 0.75, 50)) },
    { label: '팟', value: Math.max(snapshot.minRaise, roundToStep(potTotal, 50)) },
    { label: '올인', value: snapshot.maxRaise },
  ]
  const hasBetControl = snapshot.actions.find((action) => action.id === 'raise')?.enabled ?? false
  const isPending = phase === 'pending' || snapshot.key === 'pending'

  return (
    <section aria-label="포커 액션" className="action-dock">
      {hasBetControl ? (
        <div className="bet-control">
          <div className="bet-control-header">
            <span>
              콜 {formatChips(snapshot.callAmount)} · 최소 레이즈 {formatChips(snapshot.minRaise)}
            </span>
            <div aria-label="빠른 베팅 금액" className="quick-bets">
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
              step={50}
              type="range"
              value={selectedBetAmount}
            />
            <output aria-live="polite">{formatChips(selectedBetAmount)}</output>
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
          const label =
            isSubmitted
              ? '처리 중…'
              : action.id === 'raise' && action.enabled
              ? isSubmitted
                ? '처리 중…'
                : `레이즈 ${formatChips(selectedBetAmount)}`
              : action.label
          const detail = isSubmitted
            ? action.id === 'raise'
              ? `레이즈 ${formatChips(selectedBetAmount)}`
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
