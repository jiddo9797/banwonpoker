import { handIndex } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HandAction, ReplayHand } from '../replay/model'
import chart6p100 from './charts/6p-100bb.json'
import { SpotDialog } from './SpotDialog'
import { analyzeSpot, spotAt } from './spot'

const sixMax = chart6p100 as ChartFile
const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']

/** 6인 100BB(빅 블라인드 100, 모두 10,000칩) 핸드. actions는 [포지션, 종류, 총액, 올인] */
function handWith(actions: Array<[string, HandAction['kind'], number, boolean?]>, street: HandAction['street'] = 'preflop'): ReplayHand {
  return {
    number: 7,
    board: [],
    players: positions.map((name) => ({
      id: name,
      name: name === 'BTN' ? '나' : name.toLowerCase(),
      position: name === 'BTN' ? 'hero' : 'top-center',
      cards: name === 'BTN' ? [{ rank: 'Q', suit: 'heart' }, { rank: 'J', suit: 'heart' }] : [{ rank: '2', suit: 'club' }, { rank: '7', suit: 'diamond' }],
      badge: name,
    })),
    actions: [
      { id: 'sb', street: 'preflop', playerId: 'SB', label: 'SB 50', kind: 'blind', pot: 50, added: 50, to: 50, audio: { status: 'none' } },
      { id: 'bb', street: 'preflop', playerId: 'BB', label: 'BB 100', kind: 'blind', pot: 150, added: 100, to: 100, audio: { status: 'none' } },
      ...actions.map(([player, kind, to, allIn], index) => ({
        id: `a${index}`,
        street: index === actions.length - 1 ? street : ('preflop' as const),
        playerId: player,
        label: kind,
        kind,
        pot: 0,
        added: 0,
        to,
        allIn: allIn ?? false,
        audio: { status: 'none' as const },
      })),
    ],
    result: '',
    startStacks: Object.fromEntries(positions.map((name) => [name, 10_000])),
    payouts: {},
    bigBlind: 100,
  }
}

describe('복기 결정 → 차트 상황', () => {
  it('앞사람 폴드 뒤 CO 오픈에 BTN이 3벳한 결정을 찾는다', () => {
    const hand = handWith([
      ['UTG', 'fold', 0],
      ['HJ', 'fold', 0],
      ['CO', 'raise', 250],
      ['BTN', 'raise', 750],
    ])
    const lookup = spotAt(hand, hand.actions.length - 1)
    expect(lookup.ok).toBe(true)
    if (!lookup.ok) return
    expect(lookup.spot).toMatchObject({
      players: 6,
      position: 'BTN',
      stack: 100,
      effectiveBb: 100,
      hand: handIndex('QJs'),
      cardsText: 'Q♥J♥',
      line: [{ position: 'CO', kind: 'raise', toBb: 2.5 }],
      actual: { position: 'BTN', kind: 'raise', toBb: 7.5 },
    })

    const result = analyzeSpot(sixMax, lookup.spot)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { analysis } = result
    expect(analysis.situation.title).toBe('vs CO 오픈 2.5BB')
    expect(analysis.labels[analysis.actualIndex]).toBe('3벳 7.5BB')
    expect(analysis.cell.frequencies.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2)
    expect(analysis.evLoss).toBeLessThanOrEqual(0)
    expect(analysis.notes).toEqual([])
  })

  it('사이즈와 스택이 차트와 다르면 근사했다고 알려준다', () => {
    const hand = handWith([
      ['UTG', 'raise', 300],
      ['HJ', 'fold', 0],
      ['CO', 'fold', 0],
      ['BTN', 'call', 300],
    ])
    hand.startStacks.BTN = 7_340
    const lookup = spotAt(hand, hand.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(lookup.spot.effectiveBb).toBe(73.4)
    expect(lookup.spot.stack).toBe(75)
    const chart = { ...sixMax, stack: 75 }
    const result = analyzeSpot(chart, lookup.spot)
    if (!result.ok) throw new Error(result.reason)
    expect(result.analysis.notes).toEqual(['유효 스택 73.4BB → 75BB 차트로 봤습니다.', 'UTG 실제 오픈 3BB → 차트 오픈 2.5BB로 봤습니다.'])
  })

  it('플랍 이후, SB가 아닌 림프, 세 명이 들어온 팟은 이유와 함께 거절한다', () => {
    const postflop = handWith([['BTN', 'bet', 300]], 'flop')
    expect(spotAt(postflop, postflop.actions.length - 1)).toMatchObject({ ok: false, reason: expect.stringContaining('플랍 이후') })

    const limp = handWith([
      ['UTG', 'call', 100],
      ['HJ', 'fold', 0],
      ['CO', 'fold', 0],
      ['BTN', 'raise', 400],
    ])
    expect(spotAt(limp, limp.actions.length - 1)).toMatchObject({ ok: false, reason: expect.stringContaining('UTG의 림프') })

    const multiway = handWith([
      ['UTG', 'raise', 250],
      ['HJ', 'call', 250],
      ['CO', 'fold', 0],
      ['BTN', 'call', 250],
    ])
    const lookup = spotAt(multiway, multiway.actions.length - 1)
    if (!lookup.ok) throw new Error(lookup.reason)
    expect(analyzeSpot(sixMax, lookup.spot)).toMatchObject({ ok: false, reason: expect.stringContaining('두 명까지') })
  })
})

describe('SpotDialog', () => {
  it('실제 행동과 GTO 선호 행동, EV 손실을 보여주고 전체 차트로 넘어간다', async () => {
    const user = userEvent.setup()
    const onOpenChart = vi.fn()
    const hand = handWith([
      ['UTG', 'fold', 0],
      ['HJ', 'fold', 0],
      ['CO', 'fold', 0],
      ['BTN', 'fold', 0],
    ])
    hand.players[3].cards = [{ rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' }]
    render(<SpotDialog onClose={() => {}} onOpenChart={onOpenChart} target={{ hand, index: hand.actions.length - 1 }} />)

    const dialog = await screen.findByRole('dialog', { name: 'GTO 분석 · 핸드 #7' })
    expect(await within(dialog).findByText('오픈 (RFI)')).toBeInTheDocument()
    expect(within(dialog).getByText('AA')).toBeInTheDocument()
    // AA를 버튼에서 폴드: 실제는 폴드, GTO는 오픈 100%, EV 손실이 있다.
    const verdict = within(dialog).getByText('EV 손실').closest('dl') as HTMLElement
    expect(within(verdict).getByText('폴드')).toBeInTheDocument()
    expect(within(verdict).getByText('오픈 2.5BB 100%')).toBeInTheDocument()
    expect(within(verdict).getByText(/^−\d+\.\d\dBB$/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '전체 차트에서 보기' }))
    expect(onOpenChart).toHaveBeenCalledWith({ players: 6, stack: 100, position: 'BTN', situationKey: 'BTN', hand: handIndex('AA') })
  })
})
