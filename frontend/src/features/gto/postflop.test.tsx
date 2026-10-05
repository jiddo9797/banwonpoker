import type { ChartFile } from '@banwonpoker/gto'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HandAction, ReplayHand } from '../replay/model'
import chart6p100 from './charts/6p-100bb.json'
import { PostflopAnalysis, matchAction } from './PostflopAnalysis'
import { postflopSpotAt, solverInput } from './postflop'
import type { PostflopReport, PostflopSolver, SolveResult } from './postflopClient'

const sixMax = chart6p100 as ChartFile
const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
type Step = [string, HandAction['kind'], number?, HandAction['street']?, boolean?]

/** 6인 100BB 핸드. 각 행동은 [포지션, 종류, 총액(이번 스트리트), 스트리트, 올인] */
function handWith(steps: Step[]): ReplayHand {
  const added = new Map<string, number>()
  let street: HandAction['street'] = 'preflop'
  let pot = 150
  const actions: HandAction[] = [
    { id: 'sb', street: 'preflop', playerId: 'SB', label: '', kind: 'blind', pot: 50, added: 50, to: 50, audio: { status: 'none' } },
    { id: 'bb', street: 'preflop', playerId: 'BB', label: '', kind: 'blind', pot: 150, added: 100, to: 100, audio: { status: 'none' } },
  ]
  added.set('SB', 50)
  added.set('BB', 100)
  steps.forEach(([player, kind, to = 0, nextStreet = street, allIn = false], index) => {
    if (nextStreet !== street) {
      street = nextStreet
      added.clear()
    }
    const paid = kind === 'fold' || kind === 'check' ? 0 : to - (added.get(player) ?? 0)
    added.set(player, (added.get(player) ?? 0) + paid)
    pot += paid
    actions.push({ id: `a${index}`, street, playerId: player, label: kind, kind, pot, added: paid, to, allIn, audio: { status: 'none' } })
  })
  return {
    number: 3,
    board: [
      { rank: '10', suit: 'diamond' },
      { rank: '9', suit: 'diamond' },
      { rank: '6', suit: 'heart' },
      { rank: 'Q', suit: 'club' },
      { rank: '2', suit: 'spade' },
    ],
    players: positions.map((name) => ({
      id: name,
      name: name === 'BTN' ? '나' : name.toLowerCase(),
      position: name === 'BTN' ? 'hero' : 'top-center',
      cards: name === 'BTN' ? [{ rank: 'Q', suit: 'heart' }, { rank: 'J', suit: 'heart' }] : [{ rank: '8', suit: 'spade' }, { rank: '7', suit: 'spade' }],
      badge: name,
    })),
    actions,
    result: '',
    startStacks: Object.fromEntries(positions.map((name) => [name, 10_000])),
    payouts: {},
    bigBlind: 100,
  }
}

const preflopBtnVsBb: Step[] = [
  ['UTG', 'fold'],
  ['HJ', 'fold'],
  ['CO', 'fold'],
  ['BTN', 'raise', 250],
  ['SB', 'fold'],
  ['BB', 'call', 250],
]

describe('복기 결정 → 솔버 입력', () => {
  it('BTN 오픈·BB 콜 팟의 플랍 결정에서 팟, 유효 스택, 경로, 레인지를 만든다', () => {
    const hand = handWith([...preflopBtnVsBb, ['BB', 'check', 0, 'flop'], ['BTN', 'bet', 200], ['BB', 'call', 200]])
    const lookup = postflopSpotAt(hand, hand.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    const { spot } = lookup
    expect(spot).toMatchObject({
      position: 'BB',
      street: 'flop',
      seats: ['BB', 'BTN'],
      startingPot: 550,
      effectiveStack: 9_750,
      stack: 100,
      flop: 'Td9d6h',
      path: [{ kind: 'check' }, { kind: 'bet', amount: 200 }],
      actual: { kind: 'call' },
      solverHand: '8s7s',
    })

    const built = solverInput(sixMax, spot)
    if (!built.ok) throw new Error(built.reason)
    expect(built.input.config).toMatchObject({ flop: 'Td9d6h', startingPot: 550, effectiveStack: 9_750, flopBets: '33%', raises: 'a', compress: true })
    // BTN 오픈 레인지에는 AA가 들어 있고, BB 콜 레인지에는 72o가 없다.
    expect(built.input.config.ipRange.split(',')).toContain('AA')
    expect(built.input.config.oopRange).not.toMatch(/(^|,)72o/)
  })

  it('턴 결정에는 턴 카드를 깔고, 세 명이 플랍을 보면 거절한다', () => {
    const turn = handWith([...preflopBtnVsBb, ['BB', 'check', 0, 'flop'], ['BTN', 'check'], ['BB', 'bet', 400, 'turn']])
    const lookup = postflopSpotAt(turn, turn.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(lookup.spot.path).toEqual([{ kind: 'check' }, { kind: 'check' }, { kind: 'deal', card: 'Qc' }])
    expect(lookup.spot.actual).toEqual({ kind: 'bet', amount: 400 })

    const multiway = handWith([
      ['UTG', 'fold'],
      ['HJ', 'fold'],
      ['CO', 'raise', 250],
      ['BTN', 'call', 250],
      ['SB', 'fold'],
      ['BB', 'call', 250],
      ['BB', 'check', 0, 'flop'],
    ])
    expect(postflopSpotAt(multiway, multiway.actions.length - 1)).toMatchObject({ ok: false, reason: expect.stringContaining('3명') })
  })

  it('실제 베팅을 가장 가까운 트리 사이즈로 맞춘다', () => {
    const actions: PostflopReport['actions'] = [
      { kind: 'check', amount: 0 },
      { kind: 'bet', amount: 182 },
      { kind: 'allin', amount: 9750 },
    ]
    expect(matchAction(actions, { kind: 'check' })).toBe(0)
    expect(matchAction(actions, { kind: 'bet', amount: 300 })).toBe(1)
    expect(matchAction(actions, { kind: 'allin', amount: 9000 })).toBe(2)
    expect(matchAction(actions, { kind: 'fold' })).toBe(-1)
  })
})

describe('PostflopAnalysis', () => {
  it('솔버를 돌리는 동안 진행을 보여주고, 끝나면 실제 행동과 GTO를 비교한다', async () => {
    const hand = handWith([...preflopBtnVsBb, ['BB', 'check', 0, 'flop'], ['BTN', 'bet', 300]])
    const lookup = postflopSpotAt(hand, hand.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    let finish = () => {}
    const solver: PostflopSolver = {
      solve: vi.fn((_key, _config, onProgress) => {
        onProgress({ iterations: 50, exploitability: 0.05, elapsedMs: 12_000, budgetMs: 120_000 })
        return new Promise<SolveResult>((resolve) => {
          finish = () => resolve({ iterations: 80, exploitability: 0.008 })
        })
      }),
      report: vi.fn(async (): Promise<PostflopReport> => ({
        player: 1,
        actions: [
          { kind: 'check', amount: 0 },
          { kind: 'bet', amount: 182 },
          { kind: 'allin', amount: 9750 },
        ],
        strategy: [0.7, 0.3, 0],
        evs: [300, 280, 100],
        equity: 0.41,
        weight: 0.5,
        rangeStrategy: [0.55, 0.4, 0.05],
        pot: 550,
        board: ['6h', '9d', 'Td'],
        mappings: [{ real: { kind: 'check', amount: 0 }, chosen: { kind: 'check', amount: 0 } }],
      })),
    }
    render(<PostflopAnalysis load={async () => sixMax} solver={solver} spot={lookup.spot} />)

    expect(await screen.findByText(/솔버 계산 중 · 50회 · 오차 팟의 5\.0%/)).toBeInTheDocument()
    finish()

    const verdict = (await screen.findByText('EV 손실')).closest('dl') as HTMLElement
    expect(within(verdict).getByText('베팅 33% · 1.8BB')).toBeInTheDocument()
    expect(within(verdict).getByText('체크 70%')).toBeInTheDocument()
    expect(within(verdict).getByText('−0.20BB')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /베팅 33%.*실제/ })).toBeInTheDocument()
    expect(screen.getByText('실제 베팅 55% · 3BB → 트리의 베팅 33% · 1.8BB로 비교했습니다.')).toBeInTheDocument()
    expect(screen.getByText('균형 오차 팟의 0.8% (80회)까지 풀었습니다.')).toBeInTheDocument()
    expect(solver.report).toHaveBeenCalledWith(lookup.spot.key, [{ kind: 'check' }], 'QhJh')
  })
})
