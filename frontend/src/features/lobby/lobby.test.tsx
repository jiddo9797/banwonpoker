import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MicCheckStatus } from '../../app/flow'
import { defaultRoomSettings } from '../room/settings'
import { ConsentScreen } from './ConsentScreen'
import { CreateRoomScreen } from './CreateRoomScreen'
import { EntryScreen } from './EntryScreen'
import { lateJoiners, participantsFor, readyHeadcount, seatOccupantFor, validateNickname } from './fixtures'
import { GUEST_AUTO_START_MS, LobbyScreen } from './LobbyScreen'
import { MicCheckScreen } from './MicCheckScreen'
import type { PrepContext } from './PrepLayout'
import { SeatScreen } from './SeatScreen'

const guest: PrepContext = { role: 'guest', room: defaultRoomSettings, hostName: '민수' }
const host: PrepContext = { role: 'host', room: defaultRoomSettings, hostName: '하늘' }

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
    render(<EntryScreen context={guest} onCreateRoom={vi.fn()} onSubmit={onSubmit} />)
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
    render(<SeatScreen context={guest} nickname="하늘" onBack={vi.fn()} onSelect={onSelect} />)

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
        context={guest}
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
        context={guest}
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
        context={guest}
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
      context: guest,
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

describe('역할별 대기실 참가자', () => {
  it('참가자 시점에서는 민수가 방장이고, 방장 시점에서는 내가 방장이다', () => {
    expect(participantsFor('guest').find((participant) => participant.isHost)?.name).toBe('민수')
    expect(participantsFor('host').some((participant) => participant.isHost)).toBe(false)
  })

  it('방장이 친구의 좌석을 먼저 고르면 그 친구는 빈 좌석으로 옮긴다', () => {
    const seats = participantsFor('host', 3).map((participant) => participant.seatNumber).filter(Boolean)
    expect(seats).not.toContain(3)
    expect(new Set(seats).size).toBe(seats.length)
    expect(participantsFor('host', 3).find((participant) => participant.id === 'minsu')?.seatNumber).toBe(5)
  })

  it('방장 시점의 좌석 선택에는 아직 아무도 앉아 있지 않다', () => {
    expect(seatOccupantFor('host', 1)).toBeUndefined()
    expect(seatOccupantFor('guest', 1)?.name).toBe('유진')
  })

  it('앉아서 준비를 마치고 연결된 사람만 바로 시작하고, 나머지는 다음 핸드부터 참여한다', () => {
    expect(readyHeadcount('host', 6)).toBe(3)
    expect(lateJoiners('host', 6).map((participant) => participant.name)).toEqual(['서준', '지훈', '수빈'])
  })
})

describe('CreateRoomScreen', () => {
  it('닉네임과 설정이 올바르지 않으면 만들지 않고 첫 오류 칸으로 포커스를 옮긴다', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateRoomScreen initialSettings={defaultRoomSettings} onBack={vi.fn()} onCreate={onCreate} />)

    await user.clear(screen.getByLabelText('방 이름'))
    await user.click(screen.getByRole('button', { name: '방 만들기' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('내 닉네임 (방장)')).toHaveAccessibleDescription('닉네임을 입력하세요.')
    expect(screen.getByLabelText('방 이름')).toHaveAccessibleDescription('방 이름을 입력하세요.')
    await vi.waitFor(() => expect(screen.getByLabelText('내 닉네임 (방장)')).toHaveFocus())
  })

  it('시작 칩이 첫 빅 블라인드의 20배보다 적으면 알린다', async () => {
    const user = userEvent.setup()
    render(<CreateRoomScreen initialSettings={defaultRoomSettings} onBack={vi.fn()} onCreate={vi.fn()} />)

    const stack = screen.getByLabelText('시작 칩')
    await user.clear(stack)
    await user.type(stack, '1000')
    await user.click(screen.getByRole('button', { name: '방 만들기' }))

    expect(stack).toHaveAccessibleDescription(/시작 칩은 첫 빅 블라인드의 20배\(2,000\) 이상이어야 합니다/)
  })

  it('고정 블라인드로 방을 만든다', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateRoomScreen initialSettings={defaultRoomSettings} onBack={vi.fn()} onCreate={onCreate} />)

    await user.type(screen.getByLabelText('내 닉네임 (방장)'), '하늘')
    await user.click(screen.getByRole('button', { name: '25/50' }))
    expect(screen.getByLabelText('시작 칩')).toHaveValue(5000)
    await user.click(screen.getByRole('button', { name: '200BB' }))
    await user.click(screen.getByRole('button', { name: '4명' }))
    await user.click(screen.getByRole('button', { name: '방 만들기' }))

    expect(onCreate).toHaveBeenCalledWith(
      '하늘',
      expect.objectContaining({ blindMode: 'fixed', maxPlayers: 4, startingStack: 30_000 }),
    )
    expect(onCreate.mock.calls[0][1].levels[0]).toEqual({ smallBlind: 25, bigBlind: 50 })
  })

  it('시간마다 인상하면 레벨 표를 직접 고치고 늘리거나 줄일 수 있다', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<CreateRoomScreen initialSettings={defaultRoomSettings} onBack={vi.fn()} onCreate={onCreate} />)

    await user.type(screen.getByLabelText('내 닉네임 (방장)'), '하늘')
    await user.click(screen.getByRole('radio', { name: '시간마다 인상' }))
    const levels = screen.getByRole('list', { name: '블라인드 레벨' })
    expect(within(levels).getAllByRole('spinbutton')).toHaveLength(8)

    await user.click(screen.getByRole('button', { name: '레벨 추가' }))
    expect(within(levels).getAllByRole('spinbutton')).toHaveLength(9)
    await user.click(screen.getByRole('button', { name: '마지막 레벨 삭제' }))
    expect(within(levels).getAllByRole('spinbutton')).toHaveLength(8)

    // 앞 레벨보다 작게 고치면 오류
    const levelThree = screen.getByLabelText('레벨 3')
    await user.clear(levelThree)
    await user.type(levelThree, '80')
    await user.click(screen.getByRole('button', { name: '방 만들기' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText('레벨 3은 레벨 2보다 커야 합니다.')).toBeInTheDocument()

    await user.clear(levelThree)
    await user.type(levelThree, '175')
    expect(levelThree).toHaveAccessibleDescription('/ 350')
    await user.click(screen.getByRole('button', { name: '방 만들기' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onCreate.mock.calls[0][1]).toMatchObject({ blindMode: 'increasing', levelMinutes: 15 })
    expect(onCreate.mock.calls[0][1].levels[2]).toEqual({ smallBlind: 175, bigBlind: 350 })
  })
})

describe('LobbyScreen', () => {
  const lobbyProps = {
    nickname: '하늘',
    seatNumber: 6,
    selfMicLabel: '정상',
    onBack: vi.fn(),
    onSettingsChange: vi.fn(),
    onStart: vi.fn(),
  }

  it('방장은 설정을 바꾸고 준비된 인원으로 게임을 시작한다', async () => {
    const user = userEvent.setup()
    const onSettingsChange = vi.fn()
    const onStart = vi.fn()
    render(<LobbyScreen {...lobbyProps} context={host} onSettingsChange={onSettingsChange} onStart={onStart} />)

    expect(screen.getByText('https://banwonpoker.app/r/BWP-7K2Q')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '링크 복사' }))
    expect(await screen.findByText('초대 링크를 복사했습니다')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '시간마다 인상' }))
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ blindMode: 'increasing' }))

    await user.click(screen.getByRole('button', { name: '게임 시작 · 3명' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('설정에 오류가 있으면 방장도 시작할 수 없다', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(
      <LobbyScreen {...lobbyProps} context={{ ...host, room: { ...defaultRoomSettings, name: '' } }} onStart={onStart} />,
    )

    const start = screen.getByRole('button', { name: '게임 시작 · 3명' })
    expect(start).toHaveAttribute('aria-disabled', 'true')
    expect(start).toHaveAccessibleDescription('설정 오류를 고쳐야 시작할 수 있습니다.')
    await user.click(start)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('참가자는 규칙을 읽기만 하고, 방장이 시작하면 테이블로 간다', () => {
    vi.useFakeTimers()
    try {
      const onStart = vi.fn()
      render(<LobbyScreen {...lobbyProps} context={guest} onStart={onStart} />)

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByText('칩을 모두 잃으면')).toBeInTheDocument()
      expect(screen.getByText('다음 핸드부터 참여')).toBeInTheDocument()
      vi.advanceTimersByTime(GUEST_AUTO_START_MS)
      expect(onStart).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
