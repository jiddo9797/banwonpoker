import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getTableSnapshot } from '../fixtures'
import { ActionDock } from './ActionDock'
import { SidePanel } from './SidePanel'

const snapshot = getTableSnapshot('my')
const clamp = (amount: number) => Math.min(snapshot.maxRaise, Math.max(snapshot.minRaise, amount))

function Harness() {
  const [amount, setAmount] = useState(snapshot.minRaise)
  return <ActionDock onAction={() => undefined} onBetAmountChange={(value) => setAmount(clamp(value))} phase="idle" selectedBetAmount={amount} snapshot={snapshot} />
}

describe('ActionDock 금액 직접 입력', () => {
  it('숫자를 입력하고 Enter를 누르면 그 금액으로 정한다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })
    expect(input).toHaveValue('1,500')

    await user.click(input)
    await user.keyboard('{Control>}a{/Control}3210{Enter}')
    expect(input).toHaveValue('3,210')
    expect(screen.getByRole('slider', { name: '레이즈 총액' })).toHaveValue('3210')
    expect(screen.getByRole('button', { name: /레이즈 3,210/ })).toBeInTheDocument()
  })

  it('범위 밖 금액은 칸을 벗어날 때 최소·최대로 맞추고, 숫자가 아닌 글자는 받지 않는다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })

    await user.click(input)
    await user.keyboard('{Control>}a{/Control}99999')
    await user.tab()
    expect(input).toHaveValue('9,750')

    await user.click(input)
    await user.keyboard('{Control>}a{/Control}1ab0')
    expect(input).toHaveValue('10')
    await user.keyboard('{Enter}')
    expect(input).toHaveValue('1,500')
  })

  it('Escape를 누르면 입력을 버리고 원래 금액으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })
    await user.click(input)
    await user.keyboard('{Control>}a{/Control}4000{Escape}')
    expect(input).toHaveValue('1,500')
  })
})

describe('SidePanel 내보내기', () => {
  it('방장에게만 참가자마다 내보내기 버튼을 보여준다', async () => {
    const user = userEvent.setup()
    const onKick = vi.fn()
    const props = { activeTab: 'participants' as const, collapsed: false, onTabChange: () => undefined, onToggleCollapsed: () => undefined, snapshot }
    const { rerender } = render(<SidePanel {...props} />)
    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull()

    rerender(<SidePanel {...props} onKick={onKick} />)
    const first = snapshot.seats.find((seat) => seat.status !== 'empty')!
    await user.click(screen.getByRole('button', { name: `${first.name} 내보내기` }))
    expect(onKick).toHaveBeenCalledWith({ id: first.id, name: first.name })
  })
})
