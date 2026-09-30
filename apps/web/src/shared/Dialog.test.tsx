import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'

function Harness({ closable = true }: { closable?: boolean }) {
  const [open, setOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button type="button">앞 버튼</button>
      <button onClick={() => setOpen(true)} type="button">
        열기
      </button>
      <Dialog
        description={<p>설명</p>}
        initialFocusRef={cancelRef}
        onClose={closable ? () => setOpen(false) : undefined}
        open={open}
        title="확인"
      >
        <button onClick={() => setOpen(false)} ref={cancelRef} type="button">
          취소
        </button>
        <button type="button">확인하기</button>
      </Dialog>
      <button type="button">뒤 버튼</button>
    </>
  )
}

describe('Dialog', () => {
  it('제목·설명으로 이름이 붙은 모달로 열리고 지정한 요소에 포커스를 둔다', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '열기' }))

    const dialog = screen.getByRole('dialog', { name: '확인' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('설명')
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
  })

  it('Tab과 Shift+Tab 포커스를 다이얼로그 안에 가둔다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '열기' }))

    await user.tab()
    expect(screen.getByRole('button', { name: '확인하기' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '확인하기' })).toHaveFocus()
  })

  it('Escape로 닫으면 연 버튼으로 포커스가 돌아간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '열기' })
    await user.click(opener)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('버튼으로 닫아도 연 버튼으로 포커스가 돌아간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '열기' })
    await user.click(opener)

    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(opener).toHaveFocus()
  })

  it('onClose가 없으면 Escape로 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(<Harness closable={false} />)
    await user.click(screen.getByRole('button', { name: '열기' }))

    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
