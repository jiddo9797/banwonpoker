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

describe('ActionDock −/+ 버튼', () => {
  it('누를 때마다 빅 블라인드만큼 내리고 올린다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })
    const up = screen.getByRole('button', { name: '100 올리기' })
    const down = screen.getByRole('button', { name: '100 내리기' })
    expect(up).toHaveAttribute('title', '100 올리기')

    await user.click(up)
    await user.click(up)
    expect(input).toHaveValue('1,700')
    await user.click(down)
    expect(input).toHaveValue('1,600')
  })

  it('최소·최대에 닿으면 멈추고 그 버튼을 비활성으로 표시한다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })
    const up = screen.getByRole('button', { name: '100 올리기' })
    const down = screen.getByRole('button', { name: '100 내리기' })

    expect(down).toHaveAttribute('aria-disabled', 'true')
    await user.click(down)
    expect(input).toHaveValue('1,500')

    await user.click(input)
    await user.keyboard('{Control>}a{/Control}9700{Enter}')
    await user.click(up)
    expect(input).toHaveValue('9,750')
    expect(up).toHaveAttribute('aria-disabled', 'true')
    await user.click(up)
    expect(input).toHaveValue('9,750')
    expect(down).toHaveAttribute('aria-disabled', 'false')
  })

  it('금액 칸에서 ↑/↓ 키로도 빅 블라인드만큼 바꾼다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })
    await user.click(input)
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}{Enter}')
    expect(input).toHaveValue('1,600')
  })
})

describe('SidePanel 내보내기', () => {
  it('방장에게만 참가자마다 내보내기 버튼을 보여준다', async () => {
    const user = userEvent.setup()
    const onKick = vi.fn()
    const props = {
      activeTab: 'participants' as const,
      chatMessages: [],
      collapsed: false,
      onSendChat: () => undefined,
      onTabChange: () => undefined,
      onToggleCollapsed: () => undefined,
      snapshot,
    }
    const { rerender } = render(<SidePanel {...props} />)
    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull()

    rerender(<SidePanel {...props} onKick={onKick} />)
    const first = snapshot.seats.find((seat) => seat.status !== 'empty')!
    await user.click(screen.getByRole('button', { name: `${first.name} 내보내기` }))
    expect(onKick).toHaveBeenCalledWith({ id: first.id, name: first.name })
  })
})

describe('SidePanel 안 읽은 채팅', () => {
  const base = {
    collapsed: false,
    onSendChat: () => undefined,
    onTabChange: () => undefined,
    onToggleCollapsed: () => undefined,
    snapshot,
  }
  const line = (id: string, mine = false) => ({ id, name: mine ? '나' : '민수', text: `메시지 ${id}`, mine })

  it('채팅 탭을 보고 있지 않을 때 남이 보낸 새 메시지 수를 채팅 탭에 표시한다', () => {
    const { rerender } = render(<SidePanel {...base} activeTab="log" chatMessages={[line('1')]} />)
    // 처음 열었을 때 있던 메시지는 읽은 것으로 본다.
    expect(screen.getByRole('tab', { name: '채팅' })).toBeInTheDocument()

    rerender(<SidePanel {...base} activeTab="log" chatMessages={[line('1'), line('2'), line('3', true), line('4')]} />)
    expect(screen.getByRole('tab', { name: /^채팅.*안 읽은 메시지 2개$/ })).toBeInTheDocument()

    // 채팅 탭을 열면 읽은 것으로 바뀐다.
    rerender(<SidePanel {...base} activeTab="chat" chatMessages={[line('1'), line('2'), line('3', true), line('4')]} />)
    expect(screen.getByRole('tab', { name: '채팅' })).toBeInTheDocument()
    rerender(<SidePanel {...base} activeTab="log" chatMessages={[line('1'), line('2'), line('3', true), line('4')]} />)
    expect(screen.getByRole('tab', { name: '채팅' })).toBeInTheDocument()
  })

  it('패널이 접혀 있으면 채팅 탭이 선택돼 있어도 표시하고, 10개 이상은 9+로 줄인다', () => {
    const many = Array.from({ length: 12 }, (_, index) => line(String(index + 1)))
    const { rerender } = render(<SidePanel {...base} activeTab="chat" chatMessages={[]} collapsed />)
    rerender(<SidePanel {...base} activeTab="chat" chatMessages={many} collapsed />)
    const tab = screen.getByRole('tab', { name: /안 읽은 메시지 12개/ })
    expect(tab).toHaveTextContent('9+')

    rerender(<SidePanel {...base} activeTab="chat" chatMessages={many} collapsed={false} />)
    expect(screen.getByRole('tab', { name: '채팅' })).toBeInTheDocument()
  })
})
