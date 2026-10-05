import { CheckmarkCircle20Filled, Info20Regular, Warning20Filled } from '@fluentui/react-icons'
import type { ChartFile } from '@banwonpoker/gto'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import type { EquityResult } from './equity'
import type { EquityCalculator } from './equityClient'
import { percent, signedBb } from './model'
import { EQUITY_SAMPLES, callEv, cardLabel, isAllInCall, judgeCall, opponentRequests, opponentRequired, requiredEquity } from './multiway'
import type { CallVerdict, MultiwaySpot } from './multiway'

const STREET_NAMES = { flop: '플랍', turn: '턴', river: '리버' } as const
const VERDICTS: Record<CallVerdict, string> = {
  call: '콜이 수학적으로 이득',
  fold: '폴드가 수학적으로 이득',
  close: '비슷함',
}

const bbText = (chips: number, bigBlind: number) => `${Math.round((chips / bigBlind) * 10) / 10}BB`

function actualLabel(spot: MultiwaySpot): string {
  const { kind, to, allIn } = spot.actual
  const amount = bbText(to, spot.bigBlind)
  switch (kind) {
    case 'fold':
      return '폴드'
    case 'check':
      return '체크'
    case 'call':
      return allIn ? '콜(올인)' : '콜'
    case 'bet':
      return allIn ? `올인 ${amount}` : `베팅 ${amount}`
    case 'raise':
      return allIn ? `올인 ${amount}` : `레이즈 ${amount}`
    default:
      return kind
  }
}

type State = { phase: 'preparing' } | { phase: 'computing'; notes: string[] } | { phase: 'done'; notes: string[]; result: EquityResult } | { phase: 'error'; reason: string }

interface MultiwayAnalysisProps {
  spot: MultiwaySpot
  load: (players: number, stack: number) => Promise<ChartFile>
  calculator: EquityCalculator
}

/** 멀티웨이 팟의 플랍 이후 결정 하나를 승률과 팟 오즈로 살펴본다. GTO가 아니다. */
export function MultiwayAnalysis({ spot, load, calculator }: MultiwayAnalysisProps) {
  const [state, setState] = useState<State>({ phase: 'preparing' })

  useEffect(() => {
    let cancelled = false
    load(spot.players, spot.stack)
      .then(async (chart) => {
        const { opponents, notes } = opponentRequests(chart, spot)
        if (cancelled) return
        setState({ phase: 'computing', notes })
        const result = await calculator.compute({ hero: spot.heroCards, board: spot.board, opponents, samples: EQUITY_SAMPLES, seed: spot.handNumber * 131 + spot.board.length })
        if (!cancelled) setState({ phase: 'done', notes, result })
      })
      .catch((error: unknown) => !cancelled && setState({ phase: 'error', reason: error instanceof Error ? error.message : String(error) }))
    return () => {
      cancelled = true
    }
  }, [spot, load, calculator])

  const bb = (chips: number) => bbText(chips, spot.bigBlind)
  const header = (
    <>
      <p className="gto-spot-situation">
        {STREET_NAMES[spot.street]} · 팟 {bb(spot.pot)} · 내 차례: {spot.toCall > 0 ? `${bb(spot.toCall)} 콜할지` : '체크 또는 베팅'}
      </p>
      <p aria-label="보드" className="gto-board">
        {spot.board.slice(0, 3).map(cardLabel).join(' ')}
        {spot.board.length > 3 ? ` · ${spot.board.slice(3).map(cardLabel).join(' · ')}` : ''}
        <span>남은 상대 {spot.opponents.map((opponent) => `${opponent.name} · ${opponent.position}`).join(', ')}</span>
      </p>
    </>
  )
  const limits = (
    <div className="gto-multiway-limits">
      <Info20Regular aria-hidden="true" />
      <p className="visually-hidden">한계</p>
      <ul>
        <li>이 분석은 GTO가 아닙니다.</li>
        <li>앞으로의 베팅(임플라이드 오즈), 포지션, 블러프는 반영하지 않습니다.</li>
        <li>상대 레인지는 근사입니다.</li>
      </ul>
    </div>
  )

  if (state.phase === 'error') {
    return (
      <>
        {header}
        <p className="gto-spot-reason" role="status">
          {state.reason}
        </p>
        {limits}
      </>
    )
  }
  if (state.phase !== 'done') {
    return (
      <>
        {header}
        <div className="gto-solving" role="status">
          <p>{state.phase === 'preparing' ? '상대 레인지를 만드는 중…' : '승률을 계산하는 중…'}</p>
        </div>
        {limits}
      </>
    )
  }

  const { result } = state
  const facing = spot.toCall > 0
  const required = facing ? requiredEquity(spot.toCall, spot.pot) : null
  const verdict = required !== null ? judgeCall(result.equity, required) : null
  const ev = facing ? callEv(result.equity, spot.pot, spot.toCall) / spot.bigBlind : 0
  const theirs = opponentRequired(spot)
  const notes = [...state.notes]
  notes.push('상대 레인지는 프리플랍 차트에서 만들고, 플랍 이후 행동마다 그 보드에서의 핸드 강도 순으로 단순 규칙(베팅 위쪽 55%+아래쪽 10%, 레이즈 위쪽 30%+아래쪽 5%, 콜 위쪽 70%)으로 좁혔습니다.')
  if (isAllInCall(spot)) notes.push('콜하면 더 칠 칩이 없어(올인) 앞으로의 베팅이 없습니다. 이 판단은 거의 정확합니다.')
  notes.push(result.exact ? '리버라 남은 상대 레인지의 모든 조합을 정확히 셌습니다.' : `상대 핸드와 남은 보드를 ${result.samples.toLocaleString('ko-KR')}번 뽑아 셌습니다(오차 ±0.5% 안팎).`)

  const VerdictIcon = verdict === 'call' ? CheckmarkCircle20Filled : verdict === 'fold' ? Warning20Filled : Info20Regular
  const widthOf = (value: number) => ({ width: `${Math.round(value * 1000) / 10}%` }) as CSSProperties

  return (
    <>
      {header}
      <dl className="gto-multiway-facts">
        <div>
          <dt>내 승률</dt>
          <dd className="numeric">{percent(result.equity)}</dd>
        </div>
        {required !== null && verdict ? (
          <>
            <div>
              <dt>필요 승률 (팟 오즈)</dt>
              <dd className="numeric">{percent(required)}</dd>
              <dd className="gto-multiway-detail">
                {bb(spot.toCall)} ÷ ({bb(spot.pot)} + {bb(spot.toCall)})
              </dd>
            </div>
            <div className={ev > 0.005 ? 'is-gain' : ev < -0.005 ? 'is-loss' : undefined}>
              <dt>콜 기대값</dt>
              <dd className="numeric">{signedBb(ev)}</dd>
              <dd className="gto-multiway-detail">단순 계산</dd>
            </div>
          </>
        ) : (
          <>
            {theirs !== null ? (
              <div>
                <dt>상대가 콜하려면 필요한 승률</dt>
                <dd className="numeric">{percent(theirs)}</dd>
                <dd className="gto-multiway-detail">내 {actualLabel(spot)} 기준</dd>
              </div>
            ) : null}
            <div>
              <dt>실제 행동</dt>
              <dd>{actualLabel(spot)}</dd>
            </div>
          </>
        )}
      </dl>

      {required !== null && verdict ? (
        <div className="gto-compare">
          <div aria-hidden="true" className="gto-compare-labels">
            <span>필요 {percent(required)}</span>
            <span>내 승률 {percent(result.equity)}</span>
          </div>
          <div aria-hidden="true" className="gto-compare-track">
            <span className="gto-compare-fill" style={widthOf(result.equity)} />
            <span className="gto-compare-mark" style={{ left: widthOf(required).width } as CSSProperties} />
          </div>
          <p className={`gto-verdict is-${verdict}`}>
            <VerdictIcon aria-hidden="true" />
            <span>
              <strong>{VERDICTS[verdict]}</strong> · 실제 행동 {actualLabel(spot)}
            </span>
          </p>
        </div>
      ) : null}

      <div className="gto-versus">
        <p className="gto-versus-title">상대별 승률 (일대일)</p>
        <ul>
          {spot.opponents.map((opponent, index) => (
            <li key={opponent.position}>
              <span>
                {opponent.name} · {opponent.position}
              </span>
              <span aria-hidden="true" className="gto-versus-track">
                <span style={widthOf(result.versus[index])} />
              </span>
              <b className="numeric">{percent(result.versus[index])}</b>
            </li>
          ))}
        </ul>
      </div>

      <ul className="gto-spot-notes">
        <li>내 승률은 남은 상대 {spot.opponents.length}명을 모두 이길 확률입니다(비기면 나눈 몫 포함).</li>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {limits}
    </>
  )
}
