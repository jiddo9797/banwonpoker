import { handLabel } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '../../shared/Dialog'
import type { ReplayHand } from '../replay/model'
import { browserEquity } from './equityClient'
import type { EquityCalculator } from './equityClient'
import { actionTone, loadChart, percent, signedBb } from './model'
import { MultiwayAnalysis } from './MultiwayAnalysis'
import { multiwaySpotAt } from './multiway'
import { PostflopAnalysis } from './PostflopAnalysis'
import { postflopSpotAt } from './postflop'
import { browserSolver } from './postflopClient'
import type { PostflopSolver } from './postflopClient'
import { analyzeSpot, spotAt } from './spot'
import type { Spot } from './spot'
import './gto.css'

/** 차트 화면을 이 상황으로 열 때 넘기는 값 */
export interface ChartFocus {
  players: number
  stack: number
  position: string
  situationKey: string
  hand: number
}

interface SpotDialogProps {
  /** 분석할 복기 칸. null이면 닫혀 있다. */
  target: { hand: ReplayHand; index: number } | null
  onClose: () => void
  onOpenChart?: (focus: ChartFocus) => void
  load?: (players: number, stack: number) => Promise<ChartFile>
  solver?: PostflopSolver
  equity?: EquityCalculator
}

/**
 * 복기의 결정 하나를 GTO와 비교해 보여준다. 프리플랍은 차트로, 플랍 이후는 솔버로 본다.
 * 세 명 이상이 플랍을 본 팟은 GTO 대신 승률·팟 오즈 참고 분석을 보여준다.
 */
export function SpotDialog({ target, onClose, onOpenChart, load = loadChart, solver = browserSolver, equity = browserEquity }: SpotDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const postflop = useMemo(() => {
    if (!target) return null
    const action = target.hand.actions[target.index]
    return action && action.street !== 'preflop' ? postflopSpotAt(target.hand, target.index) : null
  }, [target])
  const multiway = useMemo(
    () => (target && postflop && !postflop.ok && postflop.multiway ? multiwaySpotAt(target.hand, target.index) : null),
    [target, postflop],
  )
  const lookup = useMemo(() => (target && !postflop ? spotAt(target.hand, target.index) : null), [target, postflop])
  const spot = lookup?.ok ? lookup.spot : null
  const deep = postflop?.ok ? postflop.spot : null
  const wide = multiway?.ok ? multiway.spot : null
  // 멀티웨이 참고 분석으로 넘긴 칸은 솔버의 거절 대신 참고 분석(또는 그 거절 이유)을 보여준다.
  const postflopReason = multiway ? (multiway.ok ? undefined : multiway.reason) : postflop && !postflop.ok ? postflop.reason : undefined
  const [loaded, setLoaded] = useState<{ spot: Spot; chart?: ChartFile; error?: string }>()

  useEffect(() => {
    if (!spot) return
    let cancelled = false
    load(spot.players, spot.stack).then(
      (chart) => !cancelled && setLoaded({ spot, chart }),
      (error: unknown) => !cancelled && setLoaded({ spot, error: error instanceof Error ? error.message : String(error) }),
    )
    return () => {
      cancelled = true
    }
  }, [spot, load])

  const current = loaded && loaded.spot === spot ? loaded : undefined
  const result = spot && current?.chart ? analyzeSpot(current.chart, spot) : undefined
  const analysis = result?.ok ? result.analysis : undefined
  const reason = !lookup ? undefined : !lookup.ok ? lookup.reason : current?.error ?? (result && !result.ok ? result.reason : undefined)

  return (
    <Dialog
      className="gto-spot-dialog"
      initialFocusRef={closeRef}
      onClose={onClose}
      open={target !== null}
      title={target ? `${multiway ? '참고 분석' : 'GTO 분석'} · 핸드 #${target.hand.number}` : 'GTO 분석'}
    >
      {deep ? (
        <p className="gto-spot-who">
          <strong>
            {deep.playerName} · {deep.position}
          </strong>
          <span className="numeric">{deep.cardsText}</span>
          <span className="gto-spot-hand">{handLabel(deep.hand)}</span>
          <span>
            {deep.players}인 · 레인지는 {deep.stack}BB 차트
          </span>
        </p>
      ) : null}
      {wide ? (
        <p className="gto-spot-who">
          <strong>
            {wide.playerName} · {wide.position}
          </strong>
          <span className="numeric">{wide.cardsText}</span>
          <span className="gto-spot-hand">{handLabel(wide.hand)}</span>
          <span className="gto-not-gto">GTO 아님 · {wide.opponents.length + 1}인 팟</span>
          <span>
            {wide.players}인 · 레인지는 {wide.stack}BB 차트
          </span>
        </p>
      ) : null}
      {postflopReason ? (
        <p className="gto-spot-reason" role="status">
          {postflopReason}
        </p>
      ) : null}
      {wide ? <MultiwayAnalysis calculator={equity} key={wide.key} load={load} spot={wide} /> : null}
      {deep ? <PostflopAnalysis key={`${deep.key}:${target?.index}`} load={load} solver={solver} spot={deep} /> : null}
      {spot ? (
        <p className="gto-spot-who">
          <strong>
            {spot.playerName} · {spot.position}
          </strong>
          <span className="numeric">{spot.cardsText}</span>
          <span className="gto-spot-hand">{handLabel(spot.hand)}</span>
          <span>
            {spot.players}인 · {spot.stack}BB 차트
          </span>
        </p>
      ) : null}

      {reason ? (
        <p className="gto-spot-reason" role="status">
          {reason}
        </p>
      ) : null}
      {spot && !reason && !analysis ? <p role="status">차트를 불러오는 중…</p> : null}

      {spot && analysis ? (
        <>
          <p className="gto-spot-situation">
            {analysis.situation.title}
            {analysis.node.line.length > 0 ? <span> · {analysis.situation.detail}</span> : null}
          </p>
          <table className="gto-hand-table">
            <thead>
              <tr>
                <th scope="col">행동</th>
                <th scope="col">GTO 빈도</th>
                <th scope="col">EV</th>
              </tr>
            </thead>
            <tbody>
              {analysis.node.actions.map((action, index) => (
                <tr className={index === analysis.actualIndex ? 'is-actual' : undefined} key={index}>
                  <th scope="row">
                    <span aria-hidden="true" className={`gto-swatch gto-tone-${actionTone(action.kind)}`} />
                    {analysis.labels[index]}
                    {index === analysis.actualIndex ? <span className="gto-actual-tag">실제</span> : null}
                  </th>
                  <td className="numeric">{analysis.inRange ? percent(analysis.cell.frequencies[index]) : '—'}</td>
                  <td className="numeric">{analysis.inRange ? signedBb(analysis.cell.evs[index]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {analysis.inRange ? (
            <dl className="gto-spot-verdict">
              <div>
                <dt>실제 행동</dt>
                <dd>{analysis.actualIndex >= 0 ? analysis.labels[analysis.actualIndex] : '차트에 없는 행동'}</dd>
              </div>
              <div>
                <dt>GTO 선호 행동</dt>
                <dd>
                  {analysis.labels[analysis.preferredIndex]} {percent(analysis.cell.frequencies[analysis.preferredIndex])}
                </dd>
              </div>
              <div>
                <dt>EV 손실</dt>
                <dd className={analysis.evLoss !== null && analysis.evLoss < -0.005 ? 'is-loss' : undefined}>
                  {analysis.evLoss === null ? '—' : analysis.evLoss > -0.005 ? '손실 없음' : signedBb(analysis.evLoss)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="gto-spot-reason">
              GTO에서는 앞선 결정에서 {handLabel(spot.hand)}로 이 상황까지 오지 않습니다. 이 결정보다 앞의 선택을 먼저 살펴보세요.
            </p>
          )}

          {analysis.notes.length > 0 ? (
            <ul className="gto-spot-notes">
              {analysis.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <p className="gto-note">
            {current?.chart?.method === 'push-fold' ? '푸시/폴드 내시 균형' : '근사 GTO'} 차트 기준입니다. EV는 이 결정부터의 기대 칩 증감입니다.
          </p>
        </>
      ) : null}

      <div className="dialog-actions">
        {spot && analysis && onOpenChart ? (
          <button
            className="btn btn--secondary"
            onClick={() =>
              onOpenChart({ players: spot.players, stack: spot.stack, position: spot.position, situationKey: analysis.situation.key, hand: spot.hand })
            }
            type="button"
          >
            전체 차트에서 보기
          </button>
        ) : null}
        <button className="btn btn--primary" onClick={onClose} ref={closeRef} type="button">
          닫기
        </button>
      </div>
    </Dialog>
  )
}
