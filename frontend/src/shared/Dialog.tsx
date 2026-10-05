import { Dismiss20Regular } from '@fluentui/react-icons'
import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true',
  )
}

interface DialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  /** 열릴 때 처음 포커스를 받을 요소. 없으면 첫 번째 포커스 가능 요소. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Escape 키나 닫기 동작. 생략하면 Escape로 닫을 수 없다. */
  onClose?: () => void
  className?: string
  /** 제목 옆에 붙는 알약 등. 있거나 closeButton이면 머리 줄과 본문을 나눠 그린다. */
  headerExtra?: ReactNode
  /** 머리 줄 오른쪽에 닫기 아이콘 버튼을 둔다(onClose 필요). */
  closeButton?: boolean
  children?: ReactNode
}

/**
 * 모달 다이얼로그. 열려 있는 동안 Tab 포커스를 안에 가두고,
 * 닫히면 열기 직전에 포커스가 있던 요소로 포커스를 되돌린다.
 */
export function Dialog({
  open,
  title,
  description,
  initialFocusRef,
  onClose,
  className = '',
  headerExtra,
  closeButton = false,
  children,
}: DialogProps) {
  const containerRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = containerRef.current
    const target = initialFocusRef?.current ?? (container ? getFocusableElements(container)[0] : undefined)
    ;(target ?? container)?.focus()

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && onCloseRef.current) {
      event.stopPropagation()
      onCloseRef.current()
      return
    }

    if (event.key !== 'Tab' || !containerRef.current) return
    const focusable = getFocusableElements(containerRef.current)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || active === containerRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog ${className}`}
        onKeyDown={onKeyDown}
        ref={containerRef}
        role="dialog"
        tabIndex={-1}
      >
        {headerExtra || closeButton ? (
          <>
            <div className="dialog-header">
              <h2 id={titleId}>{title}</h2>
              {headerExtra}
              {closeButton && onClose ? (
                <button aria-label="창 닫기" className="dialog-close" onClick={onClose} type="button">
                  <Dismiss20Regular aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="dialog-body">
              {description ? (
                <div className="dialog-description" id={descriptionId}>
                  {description}
                </div>
              ) : null}
              {children}
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <div className="dialog-description" id={descriptionId}>
                {description}
              </div>
            ) : null}
            {children}
          </>
        )}
      </section>
    </div>
  )
}
