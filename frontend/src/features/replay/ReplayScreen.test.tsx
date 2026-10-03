import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replayHands } from './fixtures'
import { EXPORT_TICK_MS, PLAYBACK_STEP_MS, ReplayScreen } from './ReplayScreen'
import type { ReplayAudioPlayer } from './ReplayScreen'

/** act 안에서는 렌더가 끝날 때 한 번에 반영되므로, 이어지는 타이머는 한 틱씩 나눠 진행한다. */
async function advanceTicks(ms: number, ticks: number) {
  for (let tick = 0; tick < ticks; tick += 1) {
    await act(() => vi.advanceTimersByTimeAsync(ms))
  }
}

function timelineCell(position: number) {
  return within(screen.getByRole('group', { name: '액션 타임라인' })).getByRole('button', {
    name: new RegExp(`^${position}번째 액션`),
  })
}

describe('ReplayScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('모든 참가자의 홀카드를 공개하고 현재 액션을 표시한다', () => {
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '복기 · 핸드 #24' })).toBeInTheDocument()
    for (const name of ['유진', '서준', '민수', '지훈', '수빈', '나']) {
      expect(screen.getByRole('group', { name: `${name}의 홀카드` })).toBeInTheDocument()
    }
    expect(screen.getByRole('img', { name: '7 클럽' })).toBeInTheDocument()
    expect(timelineCell(1)).toHaveAttribute('aria-current', 'step')
  })

  it('핸드 번호를 누르면 목록이 열리고, 고른 핸드로 바로 간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    const toggle = screen.getByRole('button', { name: /#24 · 핸드 목록 열기/ })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('group', { name: '핸드 목록 · 2개' })
    const current = within(list).getByRole('button', { name: /#24/ })
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toHaveFocus()

    await user.click(within(list).getByRole('button', { name: /#23/ }))
    expect(screen.getByRole('heading', { name: '복기 · 핸드 #23' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /핸드 목록/ })).toBeNull()
    expect(screen.getByRole('button', { name: /#23 · 핸드 목록 열기/ })).toHaveFocus()

    // Escape로 닫는다.
    await user.click(screen.getByRole('button', { name: /핸드 목록 열기/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /핸드 목록/ })).toBeNull()
  })

  it('음성 위치 막대로 원하는 지점부터 듣고, 멈췄다 다시 틀면 멈춘 곳부터 이어간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const hands = replayHands.map((hand) => ({ ...hand, actions: hand.actions.map((action, index) => ({ ...action, turnSeq: index + 1 })) }))
    const calls: Array<{ startAt?: number; onTime?: (current: number, duration: number) => void; signal: AbortSignal }> = []
    const audio: ReplayAudioPlayer = {
      play: (action, options) => {
        if (action.audio.status !== 'voice') return undefined
        calls.push(options)
        return new Promise<void>(() => undefined)
      },
    }
    // 3번째 칸: 민수 콜, 음성 4초
    render(<ReplayScreen audio={audio} exportOutcome="success" hands={hands} initialHandNumber={24} initialIndex={2} onBack={vi.fn()} />)
    const slider = screen.getByRole('slider', { name: '음성 위치' })
    expect(slider).toBeEnabled()
    expect(slider).toHaveAttribute('aria-valuetext', '0:00 / 0:04')

    await user.click(screen.getByRole('button', { name: '재생' }))
    expect(calls.at(-1)?.startAt).toBe(0)
    act(() => calls.at(-1)?.onTime?.(1.5, 4.2))
    expect(slider).toHaveValue('1.5')

    // 재생 중에 옮기면 그 지점부터 다시 튼다.
    fireEvent.change(slider, { target: { value: '3' } })
    expect(calls.at(-2)?.signal.aborted).toBe(true)
    expect(calls.at(-1)?.startAt).toBe(3)

    // 멈췄다가 다시 틀면 멈춘 곳부터
    act(() => calls.at(-1)?.onTime?.(3.4, 4.2))
    await user.click(screen.getByRole('button', { name: '일시정지' }))
    await user.click(screen.getByRole('button', { name: '재생' }))
    expect(calls.at(-1)?.startAt).toBe(3.4)

    // 음성이 없는 칸이면 막대를 쓸 수 없다.
    await user.click(screen.getByRole('button', { name: '일시정지' }))
    await user.click(screen.getByRole('button', { name: '다음 액션' }))
    expect(screen.getByRole('slider', { name: '음성 위치' })).toBeDisabled()
    expect(screen.queryByText('3 / 25')).toBeNull()
  })

  it('재생하면 액션 단위로 넘어가고 마지막 칸에서 멈춘다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" initialIndex={20} onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '재생' }))
    expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(PLAYBACK_STEP_MS))
    expect(timelineCell(22)).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('발화 재생 중')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(PLAYBACK_STEP_MS))
    expect(timelineCell(23)).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: '처음부터 재생' })).toBeInTheDocument()
    expect(screen.getAllByText('나 승리 · 에이스 하이 플러시 +6,650').length).toBeGreaterThan(0)
  })

  it('좌석과 현재 액션 카드에 그 시점의 남은 칩을, 좌석 앞에 이번 스트리트에 낸 칩을 보여준다', () => {
    const { container } = render(<ReplayScreen exportOutcome="success" initialIndex={12} onBack={vi.fn()} />)

    expect(screen.getByLabelText('나 남은 칩 13,350')).toBeInTheDocument()
    expect(screen.getByLabelText('서준 남은 칩 3,800')).toBeInTheDocument()
    const facts = screen.getByText('나 남은 칩').closest('div')!
    expect(facts).toHaveTextContent('13,350−900')
    expect([...container.querySelectorAll('.replay-bet-pill')].map((pill) => pill.textContent)).toEqual(['300', '300', '900', '900'])
  })

  it('결과 칸에서는 승자의 남은 칩과 받은 칩을 보여주고 좌석 앞 칩은 숨긴다', () => {
    const { container } = render(<ReplayScreen exportOutcome="success" initialIndex={22} onBack={vi.fn()} />)

    expect(screen.getByText('나 남은 칩').closest('div')).toHaveTextContent('18,450+6,650')
    expect(container.querySelectorAll('.replay-bet-pill')).toHaveLength(0)
  })

  it('2배속이면 절반 시간에 다음 칸으로 간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '2×' }))
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '재생' }))
    await act(() => vi.advanceTimersByTimeAsync(PLAYBACK_STEP_MS / 2))

    expect(timelineCell(2)).toHaveAttribute('aria-current', 'step')
  })

  it('타임라인은 방향키로 칸과 포커스를 함께 옮긴다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    await user.click(timelineCell(1))
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(timelineCell(3)).toHaveFocus()
    expect(timelineCell(3)).toHaveAttribute('aria-current', 'step')
    expect(timelineCell(3)).toHaveAttribute('tabindex', '0')
    expect(timelineCell(1)).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End}')
    expect(timelineCell(23)).toHaveFocus()
    await user.keyboard('{Home}')
    expect(timelineCell(1)).toHaveFocus()
  })

  it('타임라인 칸은 무발언·기록 실패·누락·음성 없이 참여를 구분한다', () => {
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    expect(timelineCell(4)).toHaveAccessibleName(/지훈 콜 100, 무발언/)
    expect(timelineCell(7)).toHaveAccessibleName(/유진 폴드, 음성 없이 참여/)
    expect(timelineCell(11)).toHaveAccessibleName(/지훈 폴드, 기록 실패/)
    expect(timelineCell(15)).toHaveAccessibleName(/민수 폴드, 누락/)
    expect(timelineCell(12)).toHaveAccessibleName(/수빈 레이즈 900, 음성 14초, 생각 18초/)
  })

  it('참가자별로 음소거하고 음량을 바꿀 수 있다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    const mute = screen.getByRole('button', { name: '수빈 음소거' })
    await user.click(mute)
    expect(mute).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: '수빈 음량' })).toHaveAttribute('aria-valuetext', '음소거, 80')

    // 음성 없이 참여한 참가자는 조절할 트랙이 없다.
    expect(screen.queryByRole('slider', { name: '유진 음량' })).not.toBeInTheDocument()
  })

  it('영상 내보내기: 생성 중 → 완료', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="success" onBack={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '영상 내보내기' }))
    expect(screen.getByRole('dialog', { name: '복기 영상 내보내기' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '내보내기 시작' }))

    expect(screen.getByRole('dialog', { name: '영상을 만드는 중' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '생성 취소' })).toHaveFocus()

    await advanceTicks(EXPORT_TICK_MS, 11)
    expect(screen.getByRole('dialog', { name: '영상이 준비되었습니다' })).toBeInTheDocument()
    expect(screen.getByText('banwonpoker-hand24.mp4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다운로드' })).toHaveFocus()
  })

  it('영상 내보내기: 실패하면 이유를 보여주고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ReplayScreen exportOutcome="failure" onBack={vi.fn()} />)
    const opener = screen.getByRole('button', { name: '영상 내보내기' })

    await user.click(opener)
    await user.click(screen.getByRole('button', { name: '내보내기 시작' }))
    await advanceTicks(EXPORT_TICK_MS, 7)

    expect(screen.getByRole('dialog', { name: '영상을 만들지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('60%에서 중단되었습니다')

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(screen.getByRole('progressbar', { name: '영상 생성 진행률' })).toHaveAttribute('aria-valuenow', '0')

    await user.click(screen.getByRole('button', { name: '생성 취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('URL로 연 내보내기 상태를 첫 화면에 보여준다', () => {
    render(<ReplayScreen exportOutcome="success" initialExportStatus="done" onBack={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '영상이 준비되었습니다' })).toBeInTheDocument()
  })
})
