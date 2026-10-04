import { HAND_COUNT, handIndex } from '@banwonpoker/gto'
import type { ChartFile } from '@banwonpoker/gto'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import chart6p100 from './charts/6p-100bb.json'
import { GtoScreen } from './GtoScreen'
import { actionLabel, describeLine, handCell, loadChart, nearestStack, nodeSummary, situationsFor } from './model'

const sixMax = chart6p100 as ChartFile

describe('GTO 차트 모델', () => {
  it('라인의 레이즈 단계에 맞춰 행동 이름을 붙인다', () => {
    const line = [
      { player: 2, kind: 'raise' as const, to: 2.5 },
      { player: 3, kind: 'raise' as const, to: 7.5 },
    ]
    expect(actionLabel({ kind: 'raise', to: 2.5 }, [])).toBe('오픈 2.5BB')
    expect(actionLabel({ kind: 'raise', to: 18 }, line)).toBe('4벳 18BB')
    expect(actionLabel({ kind: 'raise', to: 3.5 }, [{ player: 4, kind: 'limp', to: 1 }])).toBe('아이솔레이션 3.5BB')
    expect(actionLabel({ kind: 'allin', to: 100 }, line)).toBe('올인 100BB')
    expect(describeLine(line, sixMax.positions)).toBe('CO 오픈 2.5BB → BTN 3벳 7.5BB')
  })

  it('포지션마다 상황을 모으고 빈도의 합은 1이다', () => {
    const btn = sixMax.positions.indexOf('BTN')
    const situations = situationsFor(sixMax, btn)
    expect(situations[0].title).toBe('오픈 (RFI)')
    expect(situations.some((item) => item.title === 'vs CO 오픈 2.5BB')).toBe(true)
    for (const item of situations) {
      const total = nodeSummary(item.node).frequencies.reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(1, 2)
    }
    // AA는 버튼에서 늘 오픈한다.
    const open = handCell(situations[0].node, handIndex('AA'))
    expect(open.frequencies[0]).toBe(0)
    expect(open.reach).toBe(1)
  })

  it('모든 인원·스택 차트가 있고 노드 크기가 맞다', async () => {
    for (const players of [2, 6]) {
      for (const stack of [10, 40, 300]) {
        const chart = await loadChart(players, stack)
        expect(chart.players).toBe(players)
        for (const node of chart.nodes) {
          expect(node.strategy).toHaveLength(HAND_COUNT * node.actions.length)
          expect(node.reach).toHaveLength(HAND_COUNT)
        }
      }
    }
  })

  it('블라인드 레벨의 BB 수를 가장 가까운 차트 스택으로 맞춘다', () => {
    const stacks = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 300]
    expect(nearestStack(stacks, 37.5)).toBe(40)
    expect(nearestStack(stacks, 60)).toBe(60)
    expect(nearestStack(stacks, 1000)).toBe(300)
  })
})

describe('GtoScreen', () => {
  it('인원·포지션·상황을 바꾸면 표와 요약이 따라 바뀐다', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<GtoScreen onBack={onBack} />)

    expect(await screen.findByRole('heading', { name: 'BTN · 오픈 (RFI)' })).toBeInTheDocument()
    const matrix = screen.getByRole('group', { name: '핸드 표' })
    expect(within(matrix).getAllByRole('button')).toHaveLength(169)
    expect(within(matrix).getByRole('button', { name: /^AA: 오픈 2.5BB 100%/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'BB' }))
    expect(await screen.findByRole('heading', { name: 'BB · vs BTN 오픈 2.5BB' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2인' }))
    expect(await screen.findByRole('heading', { name: 'BB · vs BTN 림프' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'UTG' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '10' }))
    expect(await screen.findByRole('heading', { name: 'BB · vs BTN 올인 10BB' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '푸시/폴드 내시 균형' })).toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: '핸드 표' })).getByRole('button', { name: /^72o:/ }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: '폴드' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '처음 화면' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('방향키로 표의 칸을 옮긴다', async () => {
    const user = userEvent.setup()
    render(<GtoScreen onBack={() => {}} />)
    const matrix = await screen.findByRole('group', { name: '핸드 표' })
    const aks = within(matrix).getByRole('button', { name: /^AKs:/ })
    aks.focus()
    await user.keyboard('{ArrowDown}')
    expect(within(matrix).getByRole('button', { name: /^KK:/ })).toHaveFocus()
    expect(screen.getByText('KK', { selector: '.gto-hand' })).toBeInTheDocument()
  })
})
