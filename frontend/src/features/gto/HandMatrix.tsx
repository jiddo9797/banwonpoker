import { handLabel } from '@banwonpoker/gto'
import type { ChartNode, ChartStep } from '@banwonpoker/gto'
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { actionLabel, actionTone, handCell, percent } from './model'

interface HandMatrixProps {
  node: ChartNode
  /** 칸 이름에 쓰는 행동 이름의 앞 라인 */
  line: ChartStep[]
  selected: number
  onSelect: (hand: number) => void
}

/** 가장 공격적인 행동이 왼쪽에 오도록 칸 안 막대의 순서를 정한다. */
const toneOrder = { allin: 0, raise: 1, passive: 2, fold: 3 } as const

/** 13×13 핸드 표. 칸마다 행동 빈도를 가로 막대로, 범위 가중치를 막대 높이로 보여준다. */
export function HandMatrix({ node, line, selected, onSelect }: HandMatrixProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const order = node.actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => toneOrder[actionTone(a.action.kind)] - toneOrder[actionTone(b.action.kind)])
  const labels = node.actions.map((action) => actionLabel(action, line))
  const foldIndex = node.actions.findIndex((action) => action.kind === 'fold')

  // 방향키로 칸을 옮긴다(탭 순서에는 선택된 칸 하나만 둔다).
  const move = (event: KeyboardEvent<HTMLButtonElement>, hand: number) => {
    const row = Math.floor(hand / 13)
    const col = hand % 13
    const next: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [row, 0],
      End: [row, 12],
    }
    const target = next[event.key]
    if (!target) return
    event.preventDefault()
    const [r, c] = target
    if (r < 0 || r > 12 || c < 0 || c > 12) return
    const index = r * 13 + c
    onSelect(index)
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-hand="${index}"]`)?.focus()
  }

  return (
    <div aria-label="핸드 표" className="gto-matrix" ref={gridRef} role="group">
      {Array.from({ length: 169 }, (_, hand) => {
        const cell = handCell(node, hand)
        const inRange = cell.reach > 0.0005
        // 색이 반 넘게 채워진 칸은 이름을 흰색으로(대비)
        const filled = inRange && cell.reach * (1 - (foldIndex >= 0 ? cell.frequencies[foldIndex] : 0)) > 0.5
        const summary = inRange
          ? labels
              .map((label, index) => ({ label, frequency: cell.frequencies[index] }))
              .filter((item) => item.frequency >= 0.005)
              .map((item) => `${item.label} ${percent(item.frequency)}`)
              .join(', ')
          : '범위 밖'
        return (
          <button
            aria-label={`${handLabel(hand)}: ${summary}`}
            aria-pressed={selected === hand}
            className={`gto-cell${inRange ? '' : ' is-out'}${filled ? ' is-filled' : ''}`}
            data-hand={hand}
            key={hand}
            onClick={() => onSelect(hand)}
            onKeyDown={(event) => move(event, hand)}
            onMouseEnter={(event) => {
              if (event.buttons === 0) onSelect(hand)
            }}
            tabIndex={selected === hand ? 0 : -1}
            type="button"
          >
            {inRange ? (
              <span className="gto-cell-bars" style={{ height: `${Math.max(cell.reach, 0.04) * 100}%` }}>
                {order.map(({ action, index }) =>
                  cell.frequencies[index] > 0 ? (
                    <span
                      className={`gto-bar gto-tone-${actionTone(action.kind)}`}
                      key={index}
                      style={{ flexGrow: cell.frequencies[index] }}
                    />
                  ) : null,
                )}
              </span>
            ) : null}
            <span className="gto-cell-label">{handLabel(hand)}</span>
          </button>
        )
      })}
    </div>
  )
}
