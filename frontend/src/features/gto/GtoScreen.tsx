import { handIndex, handLabel } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { TopBar } from '../../shared/TopBar'
import { PlayingCard } from '../table/components/PlayingCard'
import type { Card } from '../table/model'
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

/** 핸드 이름(AKs, AKo, TT)을 보여줄 대표 카드 두 장. 수딧은 같은 무늬, 오프수트·페어는 다른 무늬 */
function sampleCards(label: string): Card[] {
  const rank = (char: string) => (char === 'T' ? '10' : char)
  const second = label.endsWith('s') ? 'spade' : 'heart'
  return [
    { rank: rank(label[0]), suit: 'spade' },
    { rank: rank(label[1]), suit: second },
  ]
}

/** 핸드 이름의 조합 수: 페어 6, 수딧 4, 오프수트 12 */
function comboCount(label: string) {
  if (label.length === 2) return 6
  return label.endsWith('s') ? 4 : 12
}

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

  const stackIndex = Math.max(0, (CHART_STACKS as readonly number[]).indexOf(stack))
  const toneRank = { allin: 0, raise: 1, passive: 2, fold: 3 } as const
  const legendOrder = node
    ? node.actions.map((action, index) => ({ action, index })).sort((a, b) => toneRank[actionTone(a.action.kind)] - toneRank[actionTone(b.action.kind)])
    : []
  const foldIndex = node ? node.actions.findIndex((action) => action.kind === 'fold') : -1
  const playShare = summary ? 1 - (foldIndex >= 0 ? summary.frequencies[foldIndex] : 0) : 0
  const playActions = node ? node.actions.filter((action) => action.kind !== 'fold') : []
  const playLabel = playActions.length === 1 && node ? labels[node.actions.indexOf(playActions[0])] : '참여'

  return (
    <div className="gto-screen">
      <TopBar
        end={
          <button className="top-bar-button" onClick={onBack} type="button">
            {backLabel}
          </button>
        }
        title="프리플랍 GTO 차트"
      />

      <div className="gto-layout">
        <aside aria-label="상황 고르기" className="gto-controls gto-card">
          <fieldset className="gto-field">
            <legend>인원</legend>
            <div className="gto-segmented" style={{ '--segments': CHART_PLAYERS.length } as CSSProperties}>
              {CHART_PLAYERS.map((count) => (
                <button aria-pressed={players === count} key={count} onClick={() => setPlayers(count)} type="button">
                  {count}인
                </button>
              ))}
            </div>
          </fieldset>

          <div className="gto-field">
            <label htmlFor="gto-stack">유효 스택 · {stack}BB</label>
            <input
              aria-valuetext={`${stack}BB`}
              className="gto-stack-slider"
              id="gto-stack"
              max={CHART_STACKS.length - 1}
              min={0}
              onChange={(event) => setStack(CHART_STACKS[Number(event.target.value)] ?? stack)}
              step={1}
              style={{ '--fill': `${(stackIndex / (CHART_STACKS.length - 1)) * 100}%` } as CSSProperties}
              type="range"
              value={stackIndex}
            />
            <div aria-label={`시작 ${chips.format(HOUSE_STARTING_STACK)}칩 기준 블라인드`} className="gto-levels" role="group">
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
          </div>

          <fieldset className="gto-field">
            <legend>내 포지션</legend>
            <div className="gto-segmented gto-segmented--small" style={{ '--segments': Math.max(positions.length, 1) } as CSSProperties}>
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
                {grouped.length > 1 ? <h3>{SITUATION_GROUP_LABELS[group]}</h3> : <h3 className="visually-hidden">{SITUATION_GROUP_LABELS[group]}</h3>}
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
          className={`gto-main gto-card${loading && node ? ' is-loading' : ''}`}
        >
          <h1 className="visually-hidden">프리플랍 GTO 차트</h1>
          {node && situation ? (
            <>
              <div className="gto-main-header">
                <h2>
                  {positions[position]} · {situation.title}
                </h2>
                <ul aria-label="행동 색" className="gto-legend-inline">
                  {legendOrder.map(({ action, index }) => (
                    <li key={index}>
                      <span aria-hidden="true" className={`gto-swatch gto-tone-${actionTone(action.kind)}`} />
                      {labels[index]}
                    </li>
                  ))}
                </ul>
              </div>
              <HandMatrix line={node.line} node={node} onSelect={setSelectedHand} selected={selectedHand} />
            </>
          ) : null}
          {loadError || !node ? (
            <p className="gto-loading" role="status">
              {loadError ?? '차트를 불러오는 중…'}
            </p>
          ) : null}
        </main>

        <aside aria-label="전략 요약" className="gto-detail">
          {node && summary && situation && chart ? (
            <>
              <section aria-labelledby="gto-range-title" className="gto-card gto-panel">
                <h2 className="micro-label" id="gto-range-title">
                  전체 범위
                </h2>
                <p className="gto-range-total">
                  <strong className="numeric">{percent(playShare)}</strong>
                  <span>{playLabel}</span>
                </p>
                <div aria-hidden="true" className="gto-range-bar">
                  {legendOrder.map(({ action, index }) =>
                    summary.frequencies[index] > 0 ? (
                      <span className={`gto-tone-${actionTone(action.kind)}`} key={index} style={{ flexGrow: summary.frequencies[index] }} />
                    ) : null,
                  )}
                </div>
                <ul className="gto-legend">
                  {legendOrder.map(({ action, index }) => (
                    <li key={index}>
                      <span aria-hidden="true" className={`gto-swatch gto-tone-${actionTone(action.kind)}`} />
                      <span className="gto-legend-label">{labels[index]}</span>
                      <span className="numeric">{percent(summary.frequencies[index])}</span>
                    </li>
                  ))}
                </ul>
                <p className="gto-note">
                  {situation.detail} · {node.line.length === 0 ? '전체 핸드' : '여기까지 온 범위'} 중 {percent(summary.rangeShare)} 조합 기준
                </p>
              </section>

              {cell ? (
                <section aria-live="polite" className="gto-card gto-panel gto-hand-card">
                  <div className="gto-hand-head">
                    <span aria-hidden="true" className="gto-mini-cards">
                      {sampleCards(handLabel(selectedHand)).map((card) => (
                        <PlayingCard card={card} className="gto-mini-card" key={`${card.rank}${card.suit}`} size="small" />
                      ))}
                    </span>
                    <h2>
                      <span className="gto-hand">{handLabel(selectedHand)}</span>
                      <span className="gto-reach">
                        조합 {comboCount(handLabel(selectedHand))}개
                        {cell.reach > 0.0005 && cell.reach < 0.995 ? ` · 범위 ${percent(cell.reach)}` : ''}
                      </span>
                    </h2>
                  </div>
                  {cell.reach > 0.0005 ? (
                    <table className="gto-hand-table gto-hand-rows">
                      <thead className="visually-hidden">
                        <tr>
                          <th scope="col">행동</th>
                          <th scope="col">빈도 막대</th>
                          <th scope="col">빈도</th>
                          <th scope="col">EV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {node.actions.map((action, index) => (
                          <tr className={cell.evs[index] === bestEv ? 'is-best' : undefined} key={index}>
                            <th scope="row">{labels[index]}</th>
                            <td aria-hidden="true" className="gto-hand-bar">
                              <span>
                                <span
                                  className={`gto-tone-${actionTone(action.kind)}`}
                                  style={{ width: `${Math.round(cell.frequencies[index] * 1000) / 10}%` }}
                                />
                              </span>
                            </td>
                            <td className="numeric">{percent(cell.frequencies[index])}</td>
                            <td className={`numeric${cell.evs[index] > 0.005 ? ' is-gain' : ''}`}>{signedBb(cell.evs[index])}</td>
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
                <p>모두 같은 유효 스택, 앤티·레이크 없음. 15BB 이하는 푸시/폴드 내시, 그보다 깊으면 근사 GTO입니다.</p>
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
    </div>
  )
}
