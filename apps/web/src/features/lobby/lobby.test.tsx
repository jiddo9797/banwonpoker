import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MicCheckStatus } from '../../app/flow'
import { ConsentScreen } from './ConsentScreen'
import { EntryScreen } from './EntryScreen'
import { validateNickname } from './fixtures'
import { MicCheckScreen } from './MicCheckScreen'
import { SeatScreen } from './SeatScreen'

describe('validateNickname', () => {
  it.each([
    ['', '닉네임을 입력하세요.'],
    ['   ', '닉네임을 입력하세요.'],
    ['가', '닉네임은 2자 이상이어야 합니다.'],
    ['아홉글자닉네임입니다', '닉네임은 8자 이하로 입력하세요.'],
    ['민수', '이미 방에 있는 닉네임입니다.'],
    ['나', '닉네임은 2자 이상이어야 합니다.'],
    [' 하늘 ', undefined],
  ])('%j → %s', (value, expected) => {
    expect(validateNickname(value)).toBe(expected)
  })
})

describe('EntryScreen', () => {
  it('잘못된 닉네임이면 오류를 알리고 입력칸에 포커스를 돌린다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<EntryScreen onSubmit={onSubmit} />)
    const input = screen.getByLabelText('닉네임')

    await user.type(input, '민수{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('이미 방에 있는 닉네임입니다.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/이미 방에 있는 닉네임입니다/)
    expect(input).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '하늘')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '입장하기' }))
    expect(onSubmit).toHaveBeenCalledWith('하늘')
  })
})

describe('SeatScreen', () => {
  it('사용 중인 좌석은 고를 수 없고, 빈 좌석을 골라야 앉을 수 있다', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<SeatScreen nickname="하늘" onBack={vi.fn()} onSelect={onSelect} />)

    expect(screen.queryByRole('button', { name: /민수/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '좌석에 앉기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('빈 좌석을 먼저 선택하세요.')
    expect(onSelect).not.toHaveBeenCalled()

    expect(screen.getByRole('group', { name: '3번 좌석, 민수 사용 중' })).toBeInTheDocument()
    const seatFive = screen.getByRole('button', { name: '5번 좌석, 빈 좌석' })
    await user.click(seatFive)
    expect(seatFive).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '5번 좌석에 앉기' }))
    expect(onSelect).toHaveBeenCalledWith(5)
  })
})

describe('ConsentScreen', () => {
  it('두 항목에 모두 동의해야 다음으로 갈 수 있다', async () => {
    const user = userEvent.setup()
    const onNext = vi.fn()
    const { rerender } = render(
      <ConsentScreen
        consent={{ recording: true, reveal: false }}
        nickname="하늘"
        onBack={vi.fn()}
        onChange={vi.fn()}
        onNext={onNext}
      />,
    )
    const next = screen.getByRole('button', { name: '다음: 마이크 점검' })

    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(next).toHaveAccessibleDescription('두 항목에 모두 동의해야 다음 단계로 갈 수 있습니다.')
    await user.click(next)
    expect(onNext).not.toHaveBeenCalled()

    rerender(
      <ConsentScreen
        consent={{ recording: true, reveal: true }}
        nickname="하늘"
        onBack={vi.fn()}
        onChange={vi.fn()}
        onNext={onNext}
      />,
    )
    await user.click(screen.getByRole('button', { name: '다음: 마이크 점검' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('체크박스를 누르면 해당 동의 항목을 바꾼다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ConsentScreen
        consent={{ recording: false, reveal: false }}
        nickname="하늘"
        onBack={vi.fn()}
        onChange={onChange}
        onNext={vi.fn()}
      />,
    )

    const reveal = screen.getByRole('checkbox', { name: '세션 종료 후 전체 패 공개에 동의합니다 (필수)' })
    expect(reveal).toHaveAccessibleDescription(/모든 참가자의 홀카드와 차례별 음성/)
    await user.click(reveal)
    expect(onChange).toHaveBeenCalledWith('reveal', true)
  })
})

describe('MicCheckScreen', () => {
  function renderMic(micStatus: MicCheckStatus, voiceless = false) {
    const props = {
      consent: { recording: true, reveal: true },
      micStatus,
      nickname: '하늘',
      voiceless,
      onBack: vi.fn(),
      onCheckFinished: vi.fn(),
      onReady: vi.fn(),
      onStartCheck: vi.fn(),
      onVoicelessChange: vi.fn(),
    }
    return { ...render(<MicCheckScreen {...props} />), props }
  }

  it('마이크 권한이 거부되면 준비할 수 없고 음성 없이 참여를 고를 수 있다', async () => {
    const user = userEvent.setup()
    const { props } = renderMic('denied')

    expect(screen.getByRole('heading', { name: '마이크 권한이 거부되었습니다' })).toBeInTheDocument()
    const ready = screen.getByRole('button', { name: '준비 완료' })
    expect(ready).toHaveAttribute('aria-disabled', 'true')
    await user.click(ready)
    expect(props.onReady).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: '음성 없이 참여' }))
    expect(props.onVoicelessChange).toHaveBeenCalledWith(true)
  })

  it('음성 없이 참여를 고르면 마이크 없이도 준비할 수 있다', async () => {
    const user = userEvent.setup()
    const { props } = renderMic('not-found', true)

    await user.click(screen.getByRole('button', { name: '준비 완료' }))
    expect(props.onReady).toHaveBeenCalledOnce()
    expect(screen.getByText(/마이크: 음성 없이 참여 · 나에게만 표시/)).toBeInTheDocument()
  })

  it('마이크가 정상이면 입력 수준을 보여주고 음성 없이 참여 선택지는 숨긴다', () => {
    renderMic('ready')

    expect(screen.getByRole('img', { name: /입력 수준/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '음성 없이 참여' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '준비 완료' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('점검 중에는 다시 시작할 수 없고, 정해진 시간이 지나면 완료를 알린다', async () => {
    vi.useFakeTimers()
    try {
      const { props } = renderMic('checking')
      const checkButton = screen.getByRole('button', { name: '확인 중…' })
      expect(checkButton).toHaveAttribute('aria-disabled', 'true')
      checkButton.click()
      expect(props.onStartCheck).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1200)
      expect(props.onCheckFinished).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('다른 참가자에게 마이크 상태가 공개되지 않는다는 안내가 있다', () => {
    renderMic('idle')
    expect(screen.getByText(/마이크 상태는 나에게만 표시됩니다/)).toBeInTheDocument()
    // 다른 참가자 행에는 준비 여부와 연결 상태만 있다.
    expect(screen.getByRole('complementary', { name: '방 정보' })).not.toHaveTextContent(/민수[^나]*마이크/)
  })
})
