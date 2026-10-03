import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getTableSnapshot } from '../fixtures'
import { ActionDock } from './ActionDock'
import { GameTable } from './GameTable'
import { SidePanel } from './SidePanel'

const snapshot = getTableSnapshot('my')
const clamp = (amount: number) => Math.min(snapshot.maxRaise, Math.max(snapshot.minRaise, amount))

function Harness({ onAction = () => undefined, pending = false }: { onAction?: (id: string) => void; pending?: boolean }) {
  const [amount, setAmount] = useState(snapshot.minRaise)
  return (
    <>
      <ActionDock
        onAction={(id) => onAction(`${id}:${amount}`)}
        onBetAmountChange={(value) => setAmount(clamp(value))}
        phase={pending ? 'pending' : 'idle'}
        selectedBetAmount={amount}
        snapshot={snapshot}
      />
      <input aria-label="채팅 입력" />
    </>
  )
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

describe('ActionDock Enter 두 번으로 레이즈', () => {
  it('금액을 입력하고 Enter로 정한 뒤, 한 번 더 Enter를 누르면 그 금액으로 레이즈한다', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)
    const input = screen.getByRole('textbox', { name: '베팅 금액 직접 입력' })

    await user.click(input)
    await user.keyboard('{Control>}a{/Control}3000{Enter}')
    expect(onAction).not.toHaveBeenCalled()
    expect(input).toHaveValue('3,000')

    await user.keyboard('{Enter}')
    expect(onAction).toHaveBeenCalledWith('raise:3000')
  })
})

describe('ActionDock 단축키', () => {
  it('C 콜, K 체크, R 레이즈, F 폴드. 할 수 없는 액션(체크)은 무시한다', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)

    await user.keyboard('ckrf')
    expect(onAction.mock.calls.map(([call]) => call)).toEqual(['call:1500', 'raise:1500', 'fold:1500'])
    expect(screen.getByRole('button', { name: /^콜/ })).toHaveAttribute('aria-keyshortcuts', 'C')
  })

  it('한글 입력 상태에서도 같은 자리의 키로 동작한다', () => {
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)
    fireEvent.keyDown(window, { key: 'ㄹ', code: 'KeyF' })
    expect(onAction).toHaveBeenCalledWith('fold:1500')
  })

  it('채팅·금액 칸에 입력하는 중, 수정 키와 함께, 처리 대기 중에는 쓰지 않는다', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const { rerender } = render(<Harness onAction={onAction} />)

    await user.click(screen.getByRole('textbox', { name: '채팅 입력' }))
    await user.keyboard('cf')
    await user.click(screen.getByRole('textbox', { name: '베팅 금액 직접 입력' }))
    await user.keyboard('r')
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC', ctrlKey: true })
    expect(onAction).not.toHaveBeenCalled()

    rerender(<Harness onAction={onAction} pending />)
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF' })
    expect(onAction).not.toHaveBeenCalled()
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

describe('GameTable 음성 끄기·켜기', () => {
  it('게임 중에 내 음성 기록을 끄고 켜는 버튼을 보여준다', async () => {
    const user = userEvent.setup()
    const onToggleVoice = vi.fn()
    const { rerender } = render(<GameTable onToggleVoice={onToggleVoice} snapshot={snapshot} />)
    await user.click(screen.getByRole('button', { name: '음성 끄기' }))
    expect(onToggleVoice).toHaveBeenCalledTimes(1)

    rerender(<GameTable onToggleVoice={onToggleVoice} snapshot={snapshot} voiceless />)
    expect(screen.getByText('음성 없이 참여 중입니다. 내 차례에도 음성이 기록되지 않습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '음성 켜기' })).toBeInTheDocument()
  })
})
