import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { streetLabels } from '../fixtures'
import type { HandAction, ReplayHand, Street } from '../model'
import { audioStatusLabel, audioTone } from './AudioTrackStatus'

interface ReplayTimelineProps {
  hand: ReplayHand
  index: number
  onSelect: (index: number) => void
}

function groupByStreet(actions: HandAction[]) {
  const groups: Array<{ street: Street; items: Array<{ action: HandAction; index: number }> }> = []
  actions.forEach((action, index) => {
    const last = groups[groups.length - 1]
    if (last?.street === action.street) last.items.push({ action, index })
    else groups.push({ street: action.street, items: [{ action, index }] })
  })
  return groups
}

/**
 * 액션 단위 칸으로 구성한 복기 타임라인(D9). 파형 편집 UI는 두지 않는다.
 * 현재 칸만 Tab으로 들어오고, 방향키·Home·End로 칸을 옮긴다.
 */
export function ReplayTimeline({ hand, index, onSelect }: ReplayTimelineProps) {
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const playerName = (playerId?: string) => hand.players.find((player) => player.id === playerId)?.name ?? '결과'

  useEffect(() => {
    cellRefs.current[index]?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [index])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = hand.actions.length - 1
    let nextIndex: number
    if (event.key === 'ArrowRight') nextIndex = Math.min(lastIndex, index + 1)
    else if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = lastIndex
    else return

    event.preventDefault()
    onSelect(nextIndex)
    cellRefs.current[nextIndex]?.focus()
  }

  return (
    <div aria-label="액션 타임라인" className="replay-timeline" onKeyDown={onKeyDown} role="group">
      {groupByStreet(hand.actions).map((group) => (
        <div className="timeline-street" key={group.street}>
          <h3 className="visually-hidden">{streetLabels[group.street]}</h3>
          <ol className="timeline-cells">
            {group.items.map(({ action, index: cellIndex }) => {
              const name = playerName(action.playerId)
              const current = cellIndex === index
              return (
                <li key={action.id}>
                  <button
                    aria-current={current ? 'step' : undefined}
                    aria-label={`${cellIndex + 1}번째 액션, ${name} ${action.label}, ${audioStatusLabel(action.audio.status, action.audio.seconds)}${action.thinkSeconds ? `, 생각 ${action.thinkSeconds}초` : ''}`}
                    className={`timeline-cell timeline-cell--${action.kind} ${current ? 'is-current' : ''}`}
                    onClick={() => onSelect(cellIndex)}
                    ref={(element) => {
                      cellRefs.current[cellIndex] = element
                    }}
                    tabIndex={current ? 0 : -1}
                    type="button"
                  >
                    <span aria-hidden="true" className="timeline-cell-head">
                      <span>{streetLabels[action.street]}</span>
                      <span className="timeline-cell-actor">{action.playerId ? name : ''}</span>
                    </span>
                    <strong aria-hidden="true" className="timeline-cell-label">
                      {action.label}
                    </strong>
                    <span aria-hidden="true" className={`timeline-cell-bar is-${audioTone(action.audio.status)}`} />
                    <span aria-hidden="true" className={`timeline-cell-note is-${audioTone(action.audio.status)}`}>
                      {action.audio.status === 'none'
                        ? action.thinkSeconds
                          ? `생각 ${action.thinkSeconds}초`
                          : '자동'
                        : audioStatusLabel(action.audio.status, action.audio.seconds)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}
