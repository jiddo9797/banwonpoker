import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LiveClient } from './client'
import { LiveApp } from './LiveApp'

type LiveSocket = ReturnType<NonNullable<ConstructorParameters<typeof LiveClient>[0]['createSocket']>>

const idleSocket = (): LiveSocket =>
  ({
    readyState: 0,
    send() {},
    close() {},
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  }) as unknown as LiveSocket

describe('LiveApp', () => {
  it('처음 화면에서 프리플랍 GTO 차트를 열고 돌아온다', async () => {
    const user = userEvent.setup()
    render(<LiveApp client={new LiveClient({ url: 'ws://test', storage: null, createSocket: idleSocket })} />)

    await user.click(screen.getByRole('button', { name: 'GTO 차트 보기' }))
    expect(screen.getByRole('heading', { level: 1, name: '프리플랍 GTO 차트' })).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: '핸드 표' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '처음 화면' }))
    expect(screen.getByRole('heading', { level: 1, name: '친구들과 포커 한 판' })).toBeInTheDocument()
  })
})
