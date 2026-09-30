import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIC_CHECK_DURATION_MS } from '../features/lobby/MicCheckScreen'
import { App } from './App'

describe('App 클릭 프로토타입', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.history.replaceState(null, '', '/?devtools=0')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('입장부터 복기까지 한 번에 이어진다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    // 1. 입장
    await user.type(screen.getByLabelText('닉네임'), '하늘')
    await user.click(screen.getByRole('button', { name: '입장하기' }))

    // 2. 좌석 선택
    expect(screen.getByRole('heading', { level: 1, name: '앉을 좌석을 고르세요' })).toHaveFocus()
    expect(window.location.search).toBe('?screen=seat&devtools=0')
    await user.click(screen.getByRole('button', { name: '6번 좌석, 빈 좌석' }))
    await user.click(screen.getByRole('button', { name: '6번 좌석에 앉기' }))

    // 3. 동의
    await user.click(screen.getByRole('checkbox', { name: /내 차례 음성 기록에 동의합니다/ }))
    await user.click(screen.getByRole('checkbox', { name: /전체 패 공개에 동의합니다/ }))
    await user.click(screen.getByRole('button', { name: '다음: 마이크 점검' }))

    // 4. 마이크 점검
    await user.click(screen.getByRole('button', { name: '마이크 점검 시작' }))
    await act(() => vi.advanceTimersByTimeAsync(MIC_CHECK_DURATION_MS))
    expect(screen.getByRole('heading', { name: '마이크가 정상입니다' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '준비 완료' }))

    // 5. 테이블 → 세션 종료
    expect(screen.getByRole('heading', { level: 1, name: /핸드 #24 포커 테이블/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?screen=table&scenario=opp&devtools=0')
    await user.click(screen.getByRole('button', { name: '메뉴' }))
    await user.click(screen.getByRole('button', { name: /세션 종료/ }))
    await user.click(screen.getByRole('button', { name: '세션 종료' }))

    // 6. 세션 요약
    expect(screen.getByRole('heading', { level: 1, name: '금요일 밤 홀덤' })).toHaveFocus()
    expect(screen.getByRole('row', { name: /나 17,300 \+7,300/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /복기 시작/ }))

    // 7. 복기
    expect(screen.getByRole('heading', { level: 1, name: '복기 · 핸드 #24' })).toHaveFocus()
    expect(window.location.search).toBe('?screen=replay&hand=24&devtools=0')
    await user.click(screen.getByRole('button', { name: '세션 요약' }))
    expect(screen.getByRole('heading', { level: 1, name: '금요일 밤 홀덤' })).toBeInTheDocument()
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

  it('음성 없이 참여로 준비하면 테이블 내 차례에 그 상태가 보인다', async () => {
    window.history.replaceState(null, '', '/?screen=mic&mic=denied&devtools=0')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    await user.click(screen.getByRole('checkbox', { name: '음성 없이 참여' }))
    await user.click(screen.getByRole('button', { name: '준비 완료' }))
    expect(window.location.search).toBe('?screen=table&scenario=opp&voiceless=1&devtools=0')
  })
})
