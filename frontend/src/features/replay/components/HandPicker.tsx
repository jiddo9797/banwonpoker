import { ChevronDown20Regular, Star16Filled } from '@fluentui/react-icons'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReplayHand } from '../model'

interface HandPickerProps {
  hands: ReplayHand[]
  currentNumber: number
  onSelect: (handNumber: number) => void
  /** 내가 복기하려고 표시한 핸드 번호 */
  marked?: ReadonlySet<number>
}

/** 핸드 번호를 누르면 이 세션의 핸드 목록을 펼쳐 원하는 핸드로 바로 간다. */
export function HandPicker({ hands, currentNumber, onSelect, marked = new Set() }: HandPickerProps) {
  const [open, setOpen] = useState(false)
  const [onlyMarked, setOnlyMarked] = useState(false)
  const showOnlyMarked = onlyMarked && marked.size > 0
  const shown = showOnlyMarked ? hands.filter((hand) => marked.has(hand.number)) : hands
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) toggleRef.current?.focus()
  }

  // 열리면 지금 핸드로 포커스를 옮기고, 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    currentRef.current?.focus()
    currentRef.current?.scrollIntoView?.({ block: 'nearest' })
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div
      className="hand-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close(true)
        }
      }}
      ref={rootRef}
    >
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-label={`핸드 #${currentNumber} · 핸드 목록 열기`}
        className="hand-picker-toggle numeric"
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        핸드 #{currentNumber}
        {marked.has(currentNumber) ? <Star16Filled aria-hidden="true" className="hand-picker-star" /> : null}
        <ChevronDown20Regular aria-hidden="true" />
      </button>
      {open ? (
        <div aria-label={`핸드 목록 · ${shown.length}개`} className="hand-picker-panel" id={listId} role="group">
          {marked.size > 0 ? (
            <button aria-pressed={showOnlyMarked} className="hand-picker-filter" onClick={() => setOnlyMarked((value) => !value)} type="button">
              <Star16Filled aria-hidden="true" />
              표시한 핸드만 보기 · {marked.size}개
            </button>
          ) : null}
          <ul>
            {shown.map((hand) => {
              const isCurrent = hand.number === currentNumber
              return (
                <li key={hand.number}>
                  <button
                    aria-current={isCurrent ? 'true' : undefined}
                    className={isCurrent ? 'is-current' : ''}
                    onClick={() => {
                      onSelect(hand.number)
                      close(true)
                    }}
                    ref={isCurrent ? currentRef : undefined}
                    type="button"
                  >
                    <span className="hand-picker-number numeric">#{hand.number}</span>
                    <span className="hand-picker-result">{hand.result}</span>
                    {marked.has(hand.number) ? (
                      <span className="hand-picker-mark">
                        <Star16Filled aria-hidden="true" />
                        <span className="visually-hidden">표시함</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
