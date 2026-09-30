import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FlipInCard } from './PlayingCard'

describe('FlipInCard', () => {
  it('앞면만 카드로 읽히고, 뒷면은 장식으로 숨긴다', () => {
    const { container } = render(<FlipInCard card={{ rank: 'A', suit: 'spade' }} delayMs={280} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name: '에이스 스페이드' })).toBeInTheDocument()
    expect(container.querySelector('.card-flip-back')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector<HTMLElement>('.card-flip')?.style.getPropertyValue('--flip-delay')).toBe('280ms')
  })
})
