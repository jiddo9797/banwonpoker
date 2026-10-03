import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUEST_AUTO_START_MS } from '../features/lobby/LobbyScreen'
import { MIC_CHECK_DURATION_MS } from '../features/lobby/MicCheckScreen'
import { App } from './App'

type User = ReturnType<typeof userEvent.setup>

async function passSeatConsentAndMic(user: User) {
  await user.click(screen.getByRole('button', { name: '6번 좌석, 빈 좌석' }))
  await user.click(screen.getByRole('button', { name: '6번 좌석에 앉기' }))

  await user.click(screen.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ }))
  await user.click(screen.getByRole('checkbox', { name: /전체 패 공개에 동의합니다/ }))
  await user.click(screen.getByRole('button', { name: '다음: 마이크 점검' }))

  await user.click(screen.getByRole('button', { name: '마이크 점검 시작' }))
  await act(() => vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS))
  expect(screen.getByRole('heading', { name: '마이크가 정상입니다' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '준비 완료' }))
}

// 방 만들기부터 복기까지 클릭·입력 수십 번을 한 테스트에서 이어 하는 흐름 테스트다.
// 혼자 돌면 2~3초지만 모든 테스트 파일이 동시에 돌면 기본 제한(5초)을 넘을 때가 있어 넉넉히 둔다.
describe('App 클릭 프로토타입', { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.history.replaceState(null, '', '/?screen=entry&devtools=0')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('방장: 방 만들기부터 복기까지 한 번에 이어진다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    // 0. 초대 링크 없이 새 방 만들기
    await user.click(screen.getByRole('button', { name: '새 방 만들기' }))
    expect(screen.getByRole('heading', { level: 1, name: '새 방을 만듭니다' })).toHaveFocus()
    expect(window.location.search).toBe('?screen=create&devtools=0')

    await user.type(screen.getByLabelText('내 닉네임 (방장)'), '하늘')
    const name = screen.getByLabelText('방 이름')
    await user.clear(name)
    await user.type(name, '토요일 홀덤')
    await user.click(screen.getByRole('radio', { name: '시간마다 인상' }))
    await user.click(screen.getByRole('button', { name: '100/200' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '인상 간격' }), '20')
    await user.click(screen.getByRole('button', { name: '방 만들기' }))

    // 1~3. 좌석·동의·마이크
    expect(window.location.search).toBe('?screen=seat&role=host&devtools=0')
    await passSeatConsentAndMic(user)

    // 4. 대기실: 설정을 바꾸고 게임 시작
    expect(screen.getByRole('heading', { level: 1, name: '친구들이 준비되면 시작하세요' })).toHaveFocus()
    const aside = screen.getByRole('complementary', { name: '방 정보' })
    expect(aside).toHaveTextContent('토요일 홀덤')
    expect(aside).toHaveTextContent('100 / 200부터 20분마다 인상')
    // 이미 6명이 들어와 있어 최대 인원을 줄일 수 없다.
    const fivePlayers = screen.getByRole('button', { name: '5명' })
    expect(fivePlayers).toHaveAttribute('aria-disabled', 'true')
    expect(fivePlayers).toHaveAccessibleDescription('지금 6명이 있어 6명 미만으로 줄일 수 없습니다.')
    await user.click(fivePlayers)
    expect(fivePlayers).toHaveAttribute('aria-pressed', 'false')
    // 대기실에서는 설정을 바꿀 수 있다.
    await user.selectOptions(screen.getByRole('combobox', { name: '인상 간격' }), '30')
    expect(aside).toHaveTextContent('100 / 200부터 30분마다 인상')
    expect(screen.getByText(/서준·지훈·수빈은\(는\) 준비를 마치면 다음 핸드부터 참여합니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '게임 시작 · 3명' }))

    // 5. 테이블: 방장이 정한 블라인드와 읽기 전용 설정
    expect(screen.getByRole('heading', { level: 1, name: /핸드 #24 포커 테이블/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?screen=table&blinds=increasing&scenario=opp&devtools=0')
    const banner = screen.getByRole('banner')
    expect(banner).toHaveTextContent('100 / 200')
    expect(banner).toHaveTextContent('레벨 1 · 12분 뒤 200 / 400')
    await user.click(screen.getByRole('button', { name: '설정' }))
    const settings = screen.getByRole('dialog', { name: '방 설정 · 토요일 홀덤' })
    expect(settings).toHaveAccessibleDescription(/게임 중에는 설정을 바꿀 수 없습니다/)
    expect(within(settings).queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(within(settings).getByRole('button', { name: '닫기' }))

    // 6. 세션 종료 → 요약
    await user.click(screen.getByRole('button', { name: '메뉴' }))
    await user.click(screen.getByRole('button', { name: /세션 종료/ }))
    await user.click(screen.getByRole('button', { name: '세션 종료' }))
    expect(screen.getByRole('heading', { level: 1, name: '금요일 밤 홀덤' })).toHaveFocus()
    expect(screen.getByRole('row', { name: /나 21,000 \+11,000/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /서준 0 −10,000.*탈락 · 핸드 #25/ })).toBeInTheDocument()

    // 7. 복기
    await user.click(screen.getByRole('button', { name: /복기 시작/ }))
    expect(screen.getByRole('heading', { level: 1, name: '복기 · 핸드 #24' })).toHaveFocus()
    expect(window.location.search).toBe('?screen=replay&hand=24&devtools=0')
  })

  it('참가자: 입장 → 대기실에서 방장을 기다리다 테이블로 들어간다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    await user.type(screen.getByLabelText('닉네임'), '하늘')
    await user.click(screen.getByRole('button', { name: '입장하기' }))
    expect(screen.getByRole('heading', { level: 1, name: '앉을 좌석을 고르세요' })).toHaveFocus()
    expect(window.location.search).toBe('?screen=seat&devtools=0')
    await passSeatConsentAndMic(user)

    // 대기실: 참가자는 설정을 바꿀 수 없다.
    expect(screen.getByRole('heading', { name: /방장 민수이\(가\) 게임을 시작하기를 기다리는 중/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('방 이름')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /게임 시작/ })).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(GUEST_AUTO_START_MS))
    expect(screen.getByRole('heading', { level: 1, name: /핸드 #24 포커 테이블/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?screen=table&role=guest&scenario=opp&devtools=0')

    // 참가자는 세션을 종료할 수 없다(D10).
    expect(screen.getByRole('banner')).toHaveTextContent('참가자')
    await user.click(screen.getByRole('button', { name: '메뉴' }))
    const endItem = screen.getByRole('button', { name: /세션 종료/ })
    expect(endItem).toHaveAttribute('aria-disabled', 'true')
    expect(endItem).toHaveTextContent('방장(민수)만 세션을 종료할 수 있습니다')
    await user.click(endItem)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('나가기를 확인하면 입장 화면으로 돌아간다', async () => {
    window.history.replaceState(null, '', '/?scenario=my&devtools=0')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    await user.click(screen.getByRole('button', { name: '나가기' }))
    await user.click(screen.getAllByRole('button', { name: '나가기' }).at(-1)!)

    expect(screen.getByRole('heading', { level: 1, name: '테이블에 입장합니다' })).toBeInTheDocument()
    expect(screen.getByLabelText('닉네임')).toHaveValue('')
  })

  it('음성 없이 참여로 준비하면 대기실을 거쳐 테이블에 그 상태로 들어간다', async () => {
    window.history.replaceState(null, '', '/?screen=mic&mic=denied&devtools=0')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    await user.click(screen.getByRole('checkbox', { name: '음성 없이 참여' }))
    await user.click(screen.getByRole('button', { name: '준비 완료' }))
    expect(screen.getByText(/마이크: 음성 없이 참여 · 나에게만 표시/)).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(GUEST_AUTO_START_MS))
    expect(window.location.search).toBe('?screen=table&role=guest&scenario=opp&voiceless=1&devtools=0')
  })
})
