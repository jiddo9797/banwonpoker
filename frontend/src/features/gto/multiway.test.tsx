import { handIndex } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card } from '../table/model'
import type { HandAction, ReplayHand } from '../replay/model'
import chart6p100 from './charts/6p-100bb.json'
import { computeEquity, exactRiver, expandRange, narrowRange, sampleEquity } from './equity'
import type { ComboRange } from './equity'
import type { EquityCalculator } from './equityClient'
import { callEv, cardNumber, judgeCall, multiwaySpotAt, preflopRange, requiredEquity } from './multiway'
import { postflopSpotAt } from './postflop'
import { SpotDialog } from './SpotDialog'

const sixMax = chart6p100 as ChartFile
const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
type Step = [string, HandAction['kind'], number?, HandAction['street']?, boolean?]

/** 6인 100BB 핸드. 각 행동은 [포지션, 종류, 총액(이번 스트리트), 스트리트, 올인]. BTN이 나(Q♥J♥) */
function handWith(steps: Step[]): ReplayHand {
  const added = new Map<string, number>([
    ['SB', 50],
    ['BB', 100],
  ])
  let street: HandAction['street'] = 'preflop'
  let pot = 150
  const actions: HandAction[] = [
    { id: 'sb', street: 'preflop', playerId: 'SB', label: '', kind: 'blind', pot: 50, added: 50, to: 50, audio: { status: 'none' } },
    { id: 'bb', street: 'preflop', playerId: 'BB', label: '', kind: 'blind', pot: 150, added: 100, to: 100, audio: { status: 'none' } },
  ]
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
    number: 12,
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

// CO 오픈, BTN 콜, BB 콜 → 세 명이 플랍을 본다.
const threeWay: Step[] = [
  ['UTG', 'fold'],
  ['HJ', 'fold'],
  ['CO', 'raise', 250],
  ['BTN', 'call', 250],
  ['SB', 'fold'],
  ['BB', 'call', 250],
]

const card = (rank: Card['rank'], suit: Card['suit']) => cardNumber({ rank, suit })
const only = (label: string) => Array.from({ length: 169 }, (_, hand) => (hand === handIndex(label) ? 1 : 0))

describe('멀티웨이 상황 읽기', () => {
  it('세 명이 본 플랍에서 콜 결정의 팟, 콜 금액, 남은 상대와 그 행동을 읽는다', () => {
    const hand = handWith([...threeWay, ['BB', 'check', 0, 'flop'], ['CO', 'bet', 400], ['BTN', 'call', 400]])
    const index = hand.actions.length - 1
    expect(postflopSpotAt(hand, index)).toMatchObject({ ok: false, multiway: true })
    const lookup = multiwaySpotAt(hand, index)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(lookup.spot).toMatchObject({
      position: 'BTN',
      street: 'flop',
      flopPlayers: 3,
      pot: 1200,
      toCall: 400,
      behind: 9_750,
      board: [card('10', 'diamond'), card('9', 'diamond'), card('6', 'heart')],
      opponents: [
        { position: 'CO', actions: [{ kind: 'bet', boardSize: 3 }] },
        { position: 'BB', actions: [{ kind: 'check', boardSize: 3 }] },
      ],
    })
  })

  it('턴 첫 결정은 이번 스트리트에 낸 칩이 없고, 폴드한 상대는 빠진다', () => {
    const hand = handWith([
      ...threeWay,
      ['BB', 'check', 0, 'flop'],
      ['CO', 'bet', 400],
      ['BTN', 'call', 400],
      ['BB', 'fold'],
      ['CO', 'bet', 900, 'turn'],
      ['BTN', 'raise', 2_700],
    ])
    const lookup = multiwaySpotAt(hand, hand.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(lookup.spot).toMatchObject({ street: 'turn', pot: 2_500, toCall: 900, streetHigh: 900, board: { length: 4 } })
    expect(lookup.spot.opponents.map((opponent) => opponent.position)).toEqual(['CO'])
    expect(lookup.spot.opponents[0].actions).toEqual([
      { kind: 'bet', boardSize: 3 },
      { kind: 'bet', boardSize: 4 },
    ])
  })

  it('스몰 블라인드가 아닌 림프가 있는 팟도 읽는다', () => {
    const hand = handWith([
      ['UTG', 'fold'],
      ['HJ', 'call', 100],
      ['CO', 'fold'],
      ['BTN', 'call', 100],
      ['SB', 'fold'],
      ['BB', 'check', 100],
      ['BB', 'check', 0, 'flop'],
      ['HJ', 'check'],
      ['BTN', 'bet', 200],
    ])
    // 솔버 쪽은 림프 때문에 거절하지 않고 참고 분석으로 넘긴다.
    expect(postflopSpotAt(hand, hand.actions.length - 1)).toMatchObject({ ok: false, multiway: true })
    const lookup = multiwaySpotAt(hand, hand.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(lookup.spot.preflop.map((step) => `${step.position}-${step.kind}`)).toEqual(['HJ-limp', 'BTN-limp', 'BB-check'])
    expect(lookup.spot).toMatchObject({ pot: 350, toCall: 0 })
  })
})

describe('상대 레인지 근사', () => {
  const line = [
    { position: 'CO', kind: 'raise' as const, toBb: 2.5 },
    { position: 'BTN', kind: 'call' as const, toBb: 2.5 },
    { position: 'BB', kind: 'call' as const, toBb: 2.5 },
  ]

  it('오프너와 첫 콜러는 차트 그대로, 오버콜러는 같은 오픈에 대한 콜 레인지로 대신한다', () => {
    const opener = preflopRange(sixMax, line, 'CO')
    expect(opener.approximation).toBeUndefined()
    expect(opener.weights[handIndex('AA')]).toBeGreaterThan(0.5)
    expect(preflopRange(sixMax, line, 'BTN').approximation).toBeUndefined()

    const overcaller = preflopRange(sixMax, line, 'BB')
    expect(overcaller.approximation).toContain('콜을 빼고')
    expect(overcaller.weights.some((weight) => weight > 0.1)).toBe(true)
  })

  it('차트에 없는 림프는 그 포지션 오픈 레인지의 아래쪽 절반으로 대신한다', () => {
    const limper = preflopRange(sixMax, [{ position: 'HJ', kind: 'limp', toBb: 1 }], 'HJ')
    expect(limper.approximation).toContain('아래쪽 절반')
    expect(limper.weights[handIndex('AA')]).toBe(0)
    expect(limper.weights.filter((weight) => weight > 0).length).toBeGreaterThan(5)
  })

  it('강도 순으로 줄 세워 베팅·콜·체크 규칙대로 좁힌다', () => {
    const range: ComboRange = {
      first: Int8Array.from({ length: 10 }, (_, i) => i),
      second: Int8Array.from({ length: 10 }, (_, i) => 20 + i),
      weights: new Float64Array(10).fill(1),
    }
    // 0번이 가장 강하다.
    const strength = Float64Array.from({ length: 10 }, (_, i) => 10 - i)
    const kept = (kind: Parameters<typeof narrowRange>[2]) => Array.from(narrowRange(range, strength, kind).weights)
    expect(kept('bet')).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 1])
    expect(kept('raise')).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 1])
    expect(kept('call')).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0])
    expect(kept('check')).toEqual([0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })
})

describe('팟 오즈와 판단', () => {
  it('필요 승률, 콜 기대값, ±3% 경계', () => {
    expect(requiredEquity(600, 1_800)).toBeCloseTo(0.25)
    expect(callEv(0.31, 1_800, 600)).toBeCloseTo(144)
    expect(judgeCall(0.29, 0.25)).toBe('call')
    expect(judgeCall(0.27, 0.25)).toBe('close')
    expect(judgeCall(0.23, 0.25)).toBe('close')
    expect(judgeCall(0.21, 0.25)).toBe('fold')
  })
})

describe('승률 계산', () => {
  const aces: [number, number] = [card('A', 'spade'), card('A', 'heart')]

  it('AA 대 KK는 약 82%, AA 대 KK 대 QQ는 정확히 센 값(67.0%)과 맞는다', () => {
    const headsUp = computeEquity({ hero: aces, board: [], opponents: [{ weights: only('KK'), actions: [] }], samples: 50_000, seed: 1 })
    expect(headsUp.equity).toBeCloseTo(0.82, 1)
    expect(Math.abs(headsUp.equity - 0.82)).toBeLessThan(0.01)

    const threeWay = computeEquity({
      hero: aces,
      board: [],
      opponents: [
        { weights: only('KK'), actions: [] },
        { weights: only('QQ'), actions: [] },
      ],
      samples: 50_000,
      seed: 2,
    })
    // 보드 49,347,144가지를 모두 센 값: AA 66.98%, KK 17.75%, QQ 15.27%
    expect(Math.abs(threeWay.equity - 0.6698)).toBeLessThan(0.008)
    expect(threeWay.exact).toBe(false)
    expect(threeWay.versus[0]).toBeGreaterThan(0.78)
  })

  it('리버의 정확한 계산과 몬테카를로가 오차 안에서 맞는다', () => {
    const hero: [number, number] = [card('Q', 'heart'), card('J', 'heart')]
    const board = [card('10', 'diamond'), card('9', 'diamond'), card('6', 'heart'), card('Q', 'club'), card('2', 'spade')]
    const dead = [...hero, ...board]
    const ranges = [preflopRange(sixMax, [{ position: 'CO', kind: 'raise', toBb: 2.5 }], 'CO'), preflopRange(sixMax, [], 'UTG')].map((range) =>
      expandRange(range.weights, dead),
    )
    const exact = exactRiver(hero, board, ranges)
    const sampled = sampleEquity(hero, board, ranges, 40_000, 3)
    expect(exact.exact).toBe(true)
    expect(Math.abs(exact.equity - sampled.equity)).toBeLessThan(0.01)
    expect(Math.abs(exact.versus[0] - sampled.versus[0])).toBeLessThan(0.01)
  })

  it('상대가 베팅하면 레인지가 강한 쪽으로 좁아져 내 승률이 내려간다', () => {
    const hero: [number, number] = [card('Q', 'heart'), card('J', 'heart')]
    const board = [card('10', 'diamond'), card('9', 'diamond'), card('6', 'heart')]
    const weights = preflopRange(sixMax, [], 'CO').weights
    const passive = computeEquity({ hero, board, opponents: [{ weights, actions: [] }], samples: 20_000, seed: 4 })
    const raised = computeEquity({ hero, board, opponents: [{ weights, actions: [{ kind: 'raise', boardSize: 3 }] }], samples: 20_000, seed: 4 })
    expect(raised.equity).toBeLessThan(passive.equity - 0.05)
    expect(raised.combos[0]).toBeLessThan(passive.combos[0])
  })
})

describe('참고 분석 창', () => {
  it('멀티웨이 팟이면 GTO가 아니라고 밝히고 승률·필요 승률·판단·상대별 승률·한계를 보여준다', async () => {
    const hand = handWith([...threeWay, ['BB', 'check', 0, 'flop'], ['CO', 'bet', 400], ['BTN', 'call', 400]])
    const calculator: EquityCalculator = {
      compute: vi.fn(async () => ({ equity: 0.31, versus: [0.58, 0.47], exact: false, samples: 40_000, combos: [120, 300] })),
    }
    render(<SpotDialog equity={calculator} load={async () => sixMax} onClose={() => {}} target={{ hand, index: hand.actions.length - 1 }} />)

    const dialog = screen.getByRole('dialog', { name: '참고 분석 · 핸드 #12' })
    expect(within(dialog).getByText('GTO 아님 · 3인 팟')).toBeInTheDocument()
    expect(within(dialog).getByText('플랍 · 팟 12BB · 내 차례: 4BB 콜할지')).toBeInTheDocument()
    const facts = (await within(dialog).findByText('콜에 필요한 승률')).closest('dl') as HTMLElement
    expect(within(facts).getByText('31%')).toBeInTheDocument()
    expect(within(facts).getByText('25%')).toBeInTheDocument()
    expect(within(facts).getByText('4BB ÷ (12BB + 4BB)')).toBeInTheDocument()
    expect(within(facts).getByText('콜이 수학적으로 이득')).toBeInTheDocument()
    // 0.31 × (12 + 4) − 4 = +0.96BB
    expect(within(facts).getByText('콜의 단순 기대값 +0.96BB')).toBeInTheDocument()
    expect(within(facts).getByText('CO 대비 58% · BB 대비 47%')).toBeInTheDocument()
    expect(within(dialog).getByText('이 분석은 GTO가 아닙니다.')).toBeInTheDocument()
    expect(within(dialog).getByText('상대 레인지는 근사입니다.')).toBeInTheDocument()
    expect(within(dialog).getByText(/BB 레인지는 차트에 없어/)).toBeInTheDocument()
    expect(calculator.compute).toHaveBeenCalledWith(
      expect.objectContaining({ hero: [card('Q', 'heart'), card('J', 'heart')], board: hand.board.slice(0, 3).map(cardNumber) }),
    )
  })

  it('베팅 결정에서는 팟 오즈 판단 대신 상대가 콜하려면 필요한 승률을 보여주고, 실제 계산도 끝까지 돈다', async () => {
    const hand = handWith([...threeWay, ['BB', 'check', 0, 'flop'], ['CO', 'check'], ['BTN', 'bet', 600]])
    const calculator: EquityCalculator = { compute: async (request) => computeEquity({ ...request, samples: 5_000 }) }
    render(<SpotDialog equity={calculator} load={async () => sixMax} onClose={() => {}} target={{ hand, index: hand.actions.length - 1 }} />)

    const facts = (await screen.findByText('상대가 콜하려면 필요한 승률')).closest('dl') as HTMLElement
    // 6 ÷ (8 + 6 + 6) = 30%
    expect(within(facts).getByText('30%')).toBeInTheDocument()
    expect(within(facts).getByText('내 베팅 6BB 기준')).toBeInTheDocument()
    expect(within(facts).queryByText('판단')).toBeNull()
    expect(within(facts).getByText(/^CO 대비 \d+% · BB 대비 \d+%$/)).toBeInTheDocument()
  })

  it('헤즈업 포스트플랍은 그대로 GTO 분석 창이다', () => {
    const hand = handWith([
      ['UTG', 'fold'],
      ['HJ', 'fold'],
      ['CO', 'fold'],
      ['BTN', 'raise', 250],
      ['SB', 'fold'],
      ['BB', 'call', 250],
      ['BB', 'check', 0, 'flop'],
    ])
    const solver = { solve: vi.fn(() => new Promise<never>(() => {})), report: vi.fn() }
    render(<SpotDialog load={async () => sixMax} onClose={() => {}} solver={solver} target={{ hand, index: hand.actions.length - 1 }} />)
    expect(screen.getByRole('dialog', { name: 'GTO 분석 · 핸드 #12' })).toBeInTheDocument()
    expect(screen.queryByText(/GTO 아님/)).toBeNull()
  })
})
