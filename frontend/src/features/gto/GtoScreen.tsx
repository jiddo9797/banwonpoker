import { handIndex, handLabel } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { ArrowLeft20Regular } from '@fluentui/react-icons'
import { useEffect, useMemo, useState } from 'react'
import { HandMatrix } from './HandMatrix'
import {
  CHART_PLAYERS,
  CHART_STACKS,
  HOUSE_LEVELS,
  HOUSE_STARTING_STACK,
  SITUATION_GROUP_LABELS,
  actionLabel,
  actionTone,
  handCell,
  loadChart,
  nearestStack,
  nodeSummary,
  percent,
  signedBb,
  situationsFor,
} from './model'
import type { Situation, SituationGroup } from './model'
import type { ChartFocus } from './SpotDialog'
import './gto.css'

interface GtoScreenProps {
  onBack: () => void
  backLabel?: string
  /** 테스트에서 차트를 바꿔 끼운다. */
  load?: (players: number, stack: number) => Promise<ChartFile>
  /** 복기에서 열 때: 이 상황과 핸드를 고른 채로 연다. */
  initial?: ChartFocus
}

const chips = new Intl.NumberFormat('ko-KR')

export function GtoScreen({ onBack, backLabel = '처음 화면', load = loadChart, initial }: GtoScreenProps) {
  const [players, setPlayers] = useState(initial?.players ?? 6)
  const [stack, setStack] = useState(initial?.stack ?? 100)
  const [positionName, setPositionName] = useState(initial?.position ?? 'BTN')
  const [situationKey, setSituationKey] = useState<string | undefined>(initial?.situationKey)
  const [selectedHand, setSelectedHand] = useState(initial?.hand ?? handIndex('AKs'))
  // 새 차트를 불러오는 동안에는 직전 차트를 그대로 두어 화면이 비었다 채워지지 않게 한다.
  const [chart, setChart] = useState<ChartFile>()
  const [failure, setFailure] = useState<{ key: string; message: string }>()

  const chartKey = `${players}-${stack}`
  useEffect(() => {
    let cancelled = false
    load(players, stack).then(
      (next) => {
        if (cancelled) return
        setChart(next)
        setFailure(undefined)
      },
      (error: unknown) => {
        if (!cancelled) setFailure({ key: chartKey, message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [chartKey, load, players, stack])

  const loading = !chart || chart.players !== players || chart.stack !== stack
  const loadError = failure?.key === chartKey ? failure.message : undefined

  // 인원이 바뀌어 없는 포지션이면 BTN(없으면 첫 포지션)으로 돌아간다.
  const positions = chart?.positions ?? []
  const position = Math.max(0, positions.indexOf(positionName) >= 0 ? positions.indexOf(positionName) : positions.indexOf('BTN'))
  const situations = useMemo(() => (chart ? situationsFor(chart, position) : []), [chart, position])
  const situation: Situation | undefined = situations.find((item) => item.key === situationKey) ?? situations[0]
  const node = situation?.node

  const grouped = useMemo(() => {
    const groups = new Map<SituationGroup, Situation[]>()
    for (const item of situations) groups.set(item.group, [...(groups.get(item.group) ?? []), item])
    return [...groups.entries()]
  }, [situations])

  const summary = node ? nodeSummary(node) : undefined
  const cell = node ? handCell(node, selectedHand) : undefined
  const labels = node ? node.actions.map((action) => actionLabel(action, node.line)) : []
  const bestEv = cell ? Math.max(...cell.evs) : 0

  return (
    <div className="gto-screen">
      <header className="gto-header">
        <button className="btn btn--secondary" onClick={onBack} type="button">
          <ArrowLeft20Regular aria-hidden="true" />
          {backLabel}
        </button>
        <div className="gto-heading">
          <h1>프리플랍 GTO 차트</h1>
          <p>모두 같은 유효 스택, 앤티·레이크 없음. 15BB 이하는 푸시/폴드 내시, 그보다 깊으면 근사 GTO입니다.</p>
        </div>
      </header>

      <aside aria-label="상황 고르기" className="gto-controls gto-card">
        <fieldset className="gto-field">
          <legend>인원</legend>
          <div className="segmented">
            {CHART_PLAYERS.map((count) => (
              <button aria-pressed={players === count} key={count} onClick={() => setPlayers(count)} type="button">
                {count}인
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="gto-field">
          <legend>유효 스택</legend>
          <div className="segmented gto-stacks">
            {CHART_STACKS.map((value) => (
              <button aria-pressed={stack === value} key={value} onClick={() => setStack(value)} type="button">
                {value}
              </button>
            ))}
          </div>
          <div className="gto-levels">
            <span>시작 {chips.format(HOUSE_STARTING_STACK)}칩 기준</span>
            {HOUSE_LEVELS.map((level) => {
              const depth = HOUSE_STARTING_STACK / level.big
              const target = nearestStack(CHART_STACKS, depth)
              return (
                <button
                  aria-pressed={stack === target}
                  key={level.big}
                  onClick={() => setStack(target)}
                  title={`${chips.format(level.small)}/${chips.format(level.big)}에서 ${chips.format(HOUSE_STARTING_STACK)}칩은 ${depth}BB → ${target}BB 차트`}
                  type="button"
                >
                  {chips.format(level.small)}/{chips.format(level.big)} · {depth}BB
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="gto-field">
          <legend>내 포지션</legend>
          <div className="segmented">
            {positions.map((name, index) => (
              <button aria-pressed={index === position} key={name} onClick={() => setPositionName(name)} type="button">
                {name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="gto-field gto-situations">
          <h2>상황</h2>
          {grouped.length === 0 && chart ? <p className="gto-empty">이 포지션에서 고를 상황이 없습니다.</p> : null}
          {grouped.map(([group, items]) => (
            <div className="gto-situation-group" key={group}>
              <h3>{SITUATION_GROUP_LABELS[group]}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.key}>
                    <button aria-pressed={item.key === situation?.key} onClick={() => setSituationKey(item.key)} type="button">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      <main
        aria-busy={loading}
        aria-label={situation ? `${positions[position]} · ${situation.title} 핸드 표` : '핸드 표'}
        className={`gto-main${loading && node ? ' is-loading' : ''}`}
      >
        {node && situation ? <HandMatrix line={node.line} node={node} onSelect={setSelectedHand} selected={selectedHand} /> : null}
        {loadError || !node ? (
          <p className="gto-loading" role="status">
            {loadError ?? '차트를 불러오는 중…'}
          </p>
        ) : null}
      </main>

      <aside aria-label="전략 요약" className="gto-detail">
        {node && summary && situation && chart ? (
          <>
            <section className="gto-card gto-panel">
              <h2>
                {positions[position]} · {situation.title}
              </h2>
              <p className="gto-sub">{situation.detail}</p>
              <ul className="gto-legend">
                {node.actions.map((action, index) => (
                  <li key={index}>
                    <span aria-hidden="true" className={`gto-swatch gto-tone-${actionTone(action.kind)}`} />
                    <span className="gto-legend-label">{labels[index]}</span>
                    <span className="numeric">{percent(summary.frequencies[index])}</span>
                  </li>
                ))}
              </ul>
              <p className="gto-note">
                {node.line.length === 0 ? '전체 핸드' : '여기까지 온 범위'} 중 {percent(summary.rangeShare)} 조합 기준
              </p>
            </section>

            {cell ? (
              <section aria-live="polite" className="gto-card gto-panel">
                <h2>
                  <span className="gto-hand">{handLabel(selectedHand)}</span>
                  {cell.reach > 0.0005 && cell.reach < 0.995 ? <span className="gto-reach">범위 {percent(cell.reach)}</span> : null}
                </h2>
                {cell.reach > 0.0005 ? (
                  <table className="gto-hand-table">
                    <thead>
                      <tr>
                        <th scope="col">행동</th>
                        <th scope="col">빈도</th>
                        <th scope="col">EV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.actions.map((action, index) => (
                        <tr className={cell.evs[index] === bestEv ? 'is-best' : undefined} key={index}>
                          <th scope="row">
                            <span aria-hidden="true" className={`gto-swatch gto-tone-${actionTone(action.kind)}`} />
                            {labels[index]}
                          </th>
                          <td className="numeric">{percent(cell.frequencies[index])}</td>
                          <td className="numeric">{signedBb(cell.evs[index])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="gto-sub">이 핸드는 앞선 행동에서 이미 다른 선택을 해 이 상황에 오지 않습니다.</p>
                )}
                <p className="gto-note">EV는 이 결정 시점부터의 기대 칩 증감입니다. 폴드는 0입니다.</p>
              </section>
            ) : null}

            <section className="gto-method">
              <h2>{chart.method === 'push-fold' ? '푸시/폴드 내시 균형' : '근사 GTO'}</h2>
              <p>
                {chart.method === 'push-fold'
                  ? '올인 또는 폴드만 고르는 게임의 균형입니다. 2인은 정확하고, 3인 이상은 올인에 두 명 이상이 콜하는 경우를 뺀 근사입니다.'
                  : '플랍 이후를 직접 풀지 않고 포지션과 핸드 특성에 따른 에퀴티 실현으로 근사했습니다. 팟을 다투는 사람은 두 명까지만 봅니다.'}
              </p>
              <p className="numeric">
                CFR {chips.format(chart.iterations)}회 · 균형 오차 {chart.nashConv.toFixed(4)}BB
              </p>
            </section>
          </>
        ) : null}
      </aside>
    </div>
  )
}
