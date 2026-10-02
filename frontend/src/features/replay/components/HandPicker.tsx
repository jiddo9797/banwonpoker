import { ChevronDown20Regular } from '@fluentui/react-icons'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReplayHand } from '../model'

interface HandPickerProps {
  hands: ReplayHand[]
  currentNumber: number
  onSelect: (handNumber: number) => void
}

/** 핸드 번호를 누르면 이 세션의 핸드 목록을 펼쳐 원하는 핸드로 바로 간다. */
export function HandPicker({ hands, currentNumber, onSelect }: HandPickerProps) {
  const [open, setOpen] = useState(false)
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
        aria-label={`#${currentNumber} · 핸드 목록 열기`}
        className="hand-picker-toggle numeric"
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        #{currentNumber}
        <ChevronDown20Regular aria-hidden="true" />
      </button>
      {open ? (
        <div aria-label={`핸드 목록 · ${hands.length}개`} className="hand-picker-panel" id={listId} role="group">
          <ul>
            {hands.map((hand) => {
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
