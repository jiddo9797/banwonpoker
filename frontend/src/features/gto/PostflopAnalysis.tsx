import { handLabel } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { useEffect, useState } from 'react'
import { percent, signedBb } from './model'
import { POSTFLOP_SIZES, solverInput } from './postflop'
import type { PathStep, PostflopSpot, SolverInput } from './postflop'
import { TARGET_EXPLOITABILITY } from './postflopClient'
import type { PostflopReport, PostflopSolver, SolveProgress, SolveResult } from './postflopClient'

type ReportAction = PostflopReport['actions'][number]

const suitSymbols: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' }
const cardText = (card: string) => `${card[0] === 'T' ? '10' : card[0]}${suitSymbols[card[1]] ?? ''}`
const bbText = (chips: number, bigBlind: number) => `${Math.round((chips / bigBlind) * 10) / 10}BB`

/** 솔버 행동의 이름. 베팅은 팟 대비 비율도 함께. 예: `베팅 33% · 1.8BB` */
export function postflopActionLabel(action: ReportAction | PathStep, pot: number, bigBlind: number): string {
  const amount = action.amount ?? 0
  switch (action.kind) {
    case 'fold':
      return '폴드'
    case 'check':
      return '체크'
    case 'call':
      return '콜'
    case 'bet':
      return `베팅 ${Math.round((amount / pot) * 100)}% · ${bbText(amount, bigBlind)}`
    case 'raise':
      return `레이즈 ${bbText(amount, bigBlind)}`
    case 'allin':
      return `올인 ${bbText(amount, bigBlind)}`
    default:
      return action.kind
  }
}

const tone = (kind: string) => (kind === 'fold' ? 'fold' : kind === 'check' || kind === 'call' ? 'passive' : kind === 'allin' ? 'allin' : 'raise')
const sized = (kind: string) => kind === 'bet' || kind === 'raise' || kind === 'allin'

/** 실제 행동에 가장 가까운 솔버 행동(솔버가 경로를 따라갈 때와 같은 규칙) */
export function matchAction(actions: ReportAction[], actual: PathStep): number {
  const exact = actions.findIndex((action) => action.kind === actual.kind && !sized(action.kind))
  if (exact >= 0) return exact
  if (!sized(actual.kind)) return -1
  if (actual.kind === 'allin') {
    const allin = actions.findIndex((action) => action.kind === 'allin')
    if (allin >= 0) return allin
  }
  let best = -1
  actions.forEach((action, index) => {
    if (!sized(action.kind)) return
    if (best < 0 || Math.abs(action.amount - (actual.amount ?? 0)) < Math.abs(actions[best].amount - (actual.amount ?? 0))) best = index
  })
  return best
}

type State =
  | { phase: 'preparing' }
  | { phase: 'solving'; input: SolverInput; progress?: SolveProgress }
  | { phase: 'done'; input: SolverInput; report: PostflopReport; result: SolveResult }
  | { phase: 'error'; reason: string }

interface PostflopAnalysisProps {
  spot: PostflopSpot
  load: (players: number, stack: number) => Promise<ChartFile>
  solver: PostflopSolver
}

/** 플랍 이후 결정 하나를 솔버로 풀어 실제 행동과 비교한다. */
export function PostflopAnalysis({ spot, load, solver }: PostflopAnalysisProps) {
  const [state, setState] = useState<State>({ phase: 'preparing' })

  useEffect(() => {
    const controller = new AbortController()
    const fail = (error: unknown) => {
      if (controller.signal.aborted) return
      setState({ phase: 'error', reason: error instanceof Error ? error.message : String(error) })
    }
    load(spot.players, spot.stack)
      .then(async (chart) => {
        const built = solverInput(chart, spot)
        if (!built.ok) throw new Error(built.reason)
        const { input } = built
        setState({ phase: 'solving', input })
        const result = await solver.solve(
          spot.key,
          input.config,
          (progress) => !controller.signal.aborted && setState({ phase: 'solving', input, progress }),
          controller.signal,
        )
        const report = await solver.report(spot.key, spot.path, spot.solverHand)
        if (!controller.signal.aborted) setState({ phase: 'done', input, report, result })
      })
      .catch(fail)
    return () => controller.abort()
  }, [spot, load, solver])

  const seats = `${spot.seats[0]} vs ${spot.seats[1]}`
  const header = (
    <p className="gto-spot-situation">
      {spot.street === 'flop' ? '플랍' : spot.street === 'turn' ? '턴' : '리버'} · {seats} · 플랍 팟 {bbText(spot.startingPot, spot.bigBlind)} · 유효{' '}
      {bbText(spot.effectiveStack, spot.bigBlind)}
    </p>
  )

  if (state.phase === 'error') {
    return (
      <>
        {header}
        <p className="gto-spot-reason" role="status">
          {state.reason}
        </p>
      </>
    )
  }

  if (state.phase !== 'done') {
    const progress = state.phase === 'solving' ? state.progress : undefined
    // 오차가 팟의 1%까지 줄거나 시간이 다 되면 끝난다. 오차는 수십 %에서 시작하므로 로그 눈금으로 보고, 둘 중 앞선 쪽을 보여준다.
    const errorRatio =
      progress && Number.isFinite(progress.exploitability)
        ? Math.log(0.6 / progress.exploitability) / Math.log(0.6 / TARGET_EXPLOITABILITY)
        : 0
    const ratio = progress ? Math.min(1, Math.max(0, errorRatio, progress.elapsedMs / progress.budgetMs)) : 0
    const error = progress && Number.isFinite(progress.exploitability) ? ` · 오차 팟의 ${(progress.exploitability * 100).toFixed(1)}%` : ''
    return (
      <>
        {header}
        <div className="gto-solving" role="status">
          <p>
            {state.phase === 'preparing'
              ? '레인지를 만드는 중…'
              : progress
                ? `솔버 계산 중 · ${progress.iterations}회${error} · ${Math.round(progress.elapsedMs / 1000)}초 · 스레드 ${progress.threads}개`
                : '솔버를 준비하는 중…'}
          </p>
          <div aria-hidden="true" className="gto-solving-bar">
            <span style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <p className="gto-note">브라우저에서 직접 풉니다. 팟의 1%까지 줄거나 2분이 지나면 멈추고, 같은 핸드의 다른 결정은 다시 풀지 않습니다.</p>
        </div>
      </>
    )
  }

  const { report, input, result } = state
  const pot = report.pot
  const labels = report.actions.map((action) => postflopActionLabel(action, pot, spot.bigBlind))
  const actualIndex = matchAction(report.actions, spot.actual)
  const inRange = report.weight > 1e-6
  const bestEv = Math.max(...report.evs)
  const preferredIndex = report.strategy.reduce((top, value, index, all) => (value > all[top] ? index : top), 0)
  const evLoss = inRange && actualIndex >= 0 ? Math.min(0, (report.evs[actualIndex] - bestEv) / spot.bigBlind) : null

  const notes = [...input.notes]
  for (const mapping of report.mappings) {
    if (!sized(mapping.real.kind)) continue
    const differs = mapping.chosen.kind !== mapping.real.kind || Math.abs(mapping.chosen.amount / Math.max(1, mapping.real.amount) - 1) > 0.15
    if (differs) {
      notes.push(`앞선 ${mapping.real.kind === 'bet' ? '베팅' : mapping.real.kind === 'raise' ? '레이즈' : '올인'} ${bbText(mapping.real.amount, spot.bigBlind)} → 트리의 ${mapping.chosen.kind === 'allin' ? '올인' : mapping.chosen.kind === 'raise' ? '레이즈' : '베팅'} ${bbText(mapping.chosen.amount, spot.bigBlind)}로 봤습니다.`)
    }
  }
  const actualLabel = postflopActionLabel(spot.actual, pot, spot.bigBlind)
  const chosen = report.actions[actualIndex]
  if (chosen && sized(spot.actual.kind) && labels[actualIndex] !== actualLabel) notes.push(`실제 ${actualLabel} → 트리의 ${labels[actualIndex]}로 비교했습니다.`)
  if (input.heroWeight < 0.005) notes.push(`GTO 프리플랍에서는 ${handLabel(spot.hand)}로 이 라인을 거의 타지 않습니다.`)
  notes.push(
    result.exploitability > 0.03
      ? `계산 시간이 다 되어 균형 오차가 팟의 ${(result.exploitability * 100).toFixed(1)}%에서 멈췄습니다(${result.iterations}회). 빈도는 대략적인 방향으로만 보세요.`
      : `균형 오차 팟의 ${(result.exploitability * 100).toFixed(1)}% (${result.iterations}회)까지 풀었습니다.`,
  )
  notes.push(
    `트리: 플랍 ${POSTFLOP_SIZES.flopBets}, 턴·리버 ${POSTFLOP_SIZES.turnBets} 베팅, 레이즈는 올인만. 레인지는 근사 프리플랍 차트에서 가져왔습니다.`,
  )

  return (
    <>
      {header}
      <p className="gto-board" aria-label="보드">
        {report.board.slice(0, 3).map(cardText).join(' ')}
        {report.board.length > 3 ? ` · ${report.board.slice(3).map(cardText).join(' · ')}` : ''}
        <span>팟 {bbText(pot, spot.bigBlind)}</span>
      </p>
      <table className="gto-hand-table">
        <thead>
          <tr>
            <th scope="col">행동</th>
            <th scope="col">GTO 빈도</th>
            <th scope="col">최선 대비 EV</th>
          </tr>
        </thead>
        <tbody>
          {report.actions.map((action, index) => (
            <tr className={index === actualIndex ? 'is-actual' : undefined} key={index}>
              <th scope="row">
                <span aria-hidden="true" className={`gto-swatch gto-tone-${tone(action.kind)}`} />
                {labels[index]}
                {index === actualIndex ? <span className="gto-actual-tag">실제</span> : null}
              </th>
              <td className="numeric">{inRange ? percent(report.strategy[index]) : '—'}</td>
              <td className="numeric">{inRange ? signedBb((report.evs[index] - bestEv) / spot.bigBlind) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {inRange ? (
        <dl className="gto-spot-verdict">
          <div>
            <dt>실제 행동</dt>
            <dd>{actualIndex >= 0 ? labels[actualIndex] : '트리에 없는 행동'}</dd>
          </div>
          <div>
            <dt>GTO 선호 행동</dt>
            <dd>
              {labels[preferredIndex]} {percent(report.strategy[preferredIndex])}
            </dd>
          </div>
          <div>
            <dt>EV 손실</dt>
            <dd className={evLoss !== null && evLoss < -0.005 ? 'is-loss' : undefined}>
              {evLoss === null ? '—' : evLoss > -0.005 ? '손실 없음' : signedBb(evLoss)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="gto-spot-reason">GTO 전략에서는 앞선 결정에서 이 핸드로 여기까지 오지 않아 비교할 수 없습니다. 앞선 결정을 먼저 살펴보세요.</p>
      )}

      <p className="gto-range-line">
        이 핸드 승률 {percent(report.equity)} · 레인지 전체:{' '}
        {report.actions.map((_, index) => `${labels[index].split(' · ')[0]} ${percent(report.rangeStrategy[index])}`).join(' / ')}
      </p>
      <ul className="gto-spot-notes">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  )
}
