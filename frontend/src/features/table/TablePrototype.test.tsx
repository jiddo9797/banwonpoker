import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultRoomSettings, generateLevels } from '../room/settings'
import { scenarioKeys } from './model'
import { PENDING_CONFIRM_DELAY_MS, TablePrototype } from './TablePrototype'

function actionButton(name: RegExp) {
  return within(screen.getByRole('region', { name: '포커 액션' })).getByRole('button', { name })
}

describe('TablePrototype', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('내 차례 → 처리 중 → 액션 확정 → 다음 차례로 넘어간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TablePrototype scenarioKey="my" />)

    expect(screen.getByText('내 차례 · 음성 기록 중')).toBeInTheDocument()
    await user.click(actionButton(/레이즈 2,400/))

    // 누른 버튼만 처리 중이고 나머지는 잠긴다.
    expect(actionButton(/처리 중…/)).toHaveAttribute('aria-disabled', 'true')
    expect(actionButton(/^콜/)).toHaveAttribute('aria-disabled', 'true')
    expect(actionButton(/^폴드/)).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('서버 확인을 기다리는 중 · 중복 입력 잠금')).toBeInTheDocument()
    expect(screen.getByText('액션 처리 중')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(PENDING_CONFIRM_DELAY_MS))

    expect(screen.getByRole('status')).toHaveTextContent('레이즈 액션이 확정되었습니다')
    expect(screen.getByText('유진 차례를 기다리는 중')).toBeInTheDocument()
    expect(screen.queryByText(/음성 기록 중/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '로그' }))
    expect(screen.getByText('내가 2,400으로 레이즈')).toBeInTheDocument()
  })

  it('빠른 선택을 누르면 레이즈 버튼 금액이 즉시 바뀐다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TablePrototype scenarioKey="my" />)

    await user.click(screen.getByRole('button', { name: '올인' }))

    expect(screen.getByRole('button', { name: '올인' })).toHaveAttribute('aria-pressed', 'true')
    expect(actionButton(/레이즈 9,750/)).toBeInTheDocument()
  })

  it('상대 차례에는 버튼이 모두 잠기고 베팅 컨트롤과 기록 상태를 숨긴다', () => {
    render(<TablePrototype scenarioKey="opp" />)

    for (const name of [/^콜/, /^레이즈/, /^체크/, /^폴드/]) {
      expect(actionButton(name)).toHaveAttribute('aria-disabled', 'true')
    }
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText(/음성 기록/)).not.toBeInTheDocument()
  })

  it.each(scenarioKeys)('%s: 상대 좌석과 참가자 탭에 녹음 상태가 드러나지 않는다', async (scenarioKey) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TablePrototype scenarioKey={scenarioKey} />)

    const seats = screen.getByRole('group', { name: '참가자 좌석' })
    expect(seats).not.toHaveTextContent(/음성|녹음|마이크|기록|업로드/)

    await user.click(screen.getByRole('tab', { name: '참가자' }))
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(/음성|녹음|마이크|기록|업로드/)
  })

  it('음성 없이 참여하면 내 좌석에 음성 없이 참여 중이라고 표시한다', () => {
    render(<TablePrototype scenarioKey="my" voiceless />)

    expect(screen.getByText('내 차례 · 음성 없이 참여 중')).toBeInTheDocument()
    expect(screen.queryByText('내 차례 · 음성 기록 중')).not.toBeInTheDocument()
  })

  it('시나리오 prop이 바뀌면 새 시나리오 상태로 다시 그린다', () => {
    const { rerender } = render(<TablePrototype scenarioKey="opp" />)
    rerender(<TablePrototype scenarioKey="disc" />)

    expect(screen.getByRole('alert')).toHaveTextContent('민수 연결이 끊겼습니다')
    expect(screen.getByText('연결 끊김 · 재접속 대기')).toBeInTheDocument()
  })

  it('채팅·로그·참가자 탭은 방향키로 선택과 포커스를 함께 옮긴다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TablePrototype scenarioKey="opp" />)
    const chatTab = screen.getByRole('tab', { name: '채팅' })
    const logTab = screen.getByRole('tab', { name: '로그' })
    const participantsTab = screen.getByRole('tab', { name: '참가자' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['채팅', '로그', '참가자'])
    expect(chatTab).toHaveAttribute('aria-selected', 'true')

    await user.click(logTab)
    await user.keyboard('{ArrowRight}')
    expect(participantsTab).toHaveFocus()
    expect(participantsTab).toHaveAttribute('aria-selected', 'true')
    expect(participantsTab).toHaveAttribute('tabindex', '0')
    expect(logTab).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowRight}')
    expect(chatTab).toHaveFocus()
    await user.keyboard('{End}')
    expect(participantsTab).toHaveFocus()
    await user.keyboard('{Home}')
    expect(chatTab).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: '채팅' })).toBeInTheDocument()
  })

  it('채팅은 Enter나 보내기로 보내고, 비어 있으면 보내지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TablePrototype scenarioKey="opp" />)
    const input = screen.getByRole('textbox', { name: '채팅 입력' })
    const sendButton = screen.getByRole('button', { name: '보내기' })
    expect(input).toHaveAttribute('maxlength', '200')
    expect(sendButton).toHaveAttribute('aria-disabled', 'true')

    await user.type(input, '   ')
    await user.click(sendButton)
    expect(screen.getAllByRole('listitem').filter((item) => item.closest('.chat-messages'))).toHaveLength(3)

    await user.clear(input)
    await user.type(input, '좋은 콜이었어{Enter}')
    expect(screen.getByText('좋은 콜이었어')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('나가기 확인창은 결과를 알리고, 확인하면 onLeave를 부른다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onLeave = vi.fn()
    render(<TablePrototype onLeave={onLeave} scenarioKey="my" />)
    const leaveButton = screen.getByRole('button', { name: '나가기' })

    await user.click(leaveButton)
    const dialog = screen.getByRole('dialog', { name: '테이블에서 나갈까요?' })
    expect(dialog).toHaveAccessibleDescription(/이번 핸드는 폴드 처리됩니다/)
    expect(within(dialog).getByRole('button', { name: '계속 플레이' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onLeave).not.toHaveBeenCalled()
    expect(leaveButton).toHaveFocus()

    await user.click(leaveButton)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '나가기' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('메뉴에서 세션을 종료하면 확인 후 onEndSession을 부르고, 취소하면 메뉴 버튼으로 돌아간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onEndSession = vi.fn()
    render(<TablePrototype onEndSession={onEndSession} scenarioKey="opp" />)
    const menuButton = screen.getByRole('button', { name: '메뉴' })

    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    const endItem = screen.getByRole('button', { name: /세션 종료/ })
    expect(endItem).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(menuButton).toHaveFocus()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(menuButton)
    await user.click(screen.getByRole('button', { name: /세션 종료/ }))
    const dialog = screen.getByRole('dialog', { name: '세션을 종료할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '계속 플레이' }))
    expect(menuButton).toHaveFocus()
    expect(onEndSession).not.toHaveBeenCalled()

    await user.click(menuButton)
    await user.click(screen.getByRole('button', { name: /세션 종료/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '세션 종료' }))
    expect(onEndSession).toHaveBeenCalledOnce()
  })
})

describe('TablePrototype 방 규칙·탈락', () => {
  it('설정 버튼은 방 규칙을 읽기 전용으로 보여준다', async () => {
    const user = userEvent.setup()
    const room = { ...defaultRoomSettings, name: '토요일 홀덤', blindMode: 'increasing' as const, levels: generateLevels(100) }
    render(<TablePrototype room={room} scenarioKey="opp" />)

    expect(screen.getByRole('banner')).toHaveTextContent('100 / 200')
    expect(screen.getByRole('banner')).toHaveTextContent('레벨 1 · 12분 뒤 200 / 400')

    const settingsButton = screen.getByRole('button', { name: '설정' })
    await user.click(settingsButton)
    const dialog = screen.getByRole('dialog', { name: '방 설정 · 토요일 홀덤' })
    expect(within(dialog).getByRole('list', { name: '블라인드 레벨' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(settingsButton).toHaveFocus()
  })

  it('고정 블라인드면 다음 레벨 안내가 없다', () => {
    render(<TablePrototype room={defaultRoomSettings} scenarioKey="opp" />)
    expect(screen.getByRole('banner')).not.toHaveTextContent('레벨')
  })

  it('참가자는 세션 종료를 누를 수 없다', async () => {
    const user = userEvent.setup()
    const onEndSession = vi.fn()
    render(<TablePrototype hostName="민수" isHost={false} onEndSession={onEndSession} scenarioKey="opp" />)

    await user.click(screen.getByRole('button', { name: '메뉴' }))
    const item = screen.getByRole('button', { name: /세션 종료/ })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(onEndSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('칩을 모두 잃은 참가자는 탈락으로, 게임 중 들어온 참가자는 다음 핸드 대기로 보인다', async () => {
    const user = userEvent.setup()
    render(<TablePrototype scenarioKey="elim" />)

    expect(screen.getByRole('status')).toHaveTextContent('서준이 칩을 모두 잃어 탈락했습니다')
    expect(screen.getByText('탈락')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /서준의/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '참가자' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('도윤').closest('li')).toHaveTextContent('대기도윤다음 핸드부터')
    expect(within(panel).getByText('서준').closest('li')).toHaveTextContent('탈락')
  })
})
