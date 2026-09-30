import { Next20Regular, Pause20Filled, Play20Filled, Previous20Regular } from '@fluentui/react-icons'
import { streetLabels } from '../fixtures'
import type { PlaybackSpeed, Street } from '../model'

const speeds: PlaybackSpeed[] = [1, 1.5, 2]

interface ReplayControlsProps {
  index: number
  total: number
  street: Street
  playing: boolean
  speed: PlaybackSpeed
  onTogglePlay: () => void
  onStep: (delta: number) => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

export function ReplayControls({
  index,
  total,
  street,
  playing,
  speed,
  onTogglePlay,
  onStep,
  onSpeedChange,
}: ReplayControlsProps) {
  const atStart = index === 0
  const atEnd = index === total - 1

  return (
    <div aria-label="재생 제어" className="replay-controls" role="group">
      <div className="replay-transport">
        <button
          aria-disabled={atStart}
          aria-label="이전 액션"
          className="icon-button"
          onClick={() => {
            if (!atStart) onStep(-1)
          }}
          type="button"
        >
          <Previous20Regular aria-hidden="true" />
        </button>
        <button className="btn btn--primary play-button" onClick={onTogglePlay} type="button">
          {playing ? <Pause20Filled aria-hidden="true" /> : <Play20Filled aria-hidden="true" />}
          {playing ? '일시정지' : atEnd ? '처음부터 재생' : '재생'}
        </button>
        <button
          aria-disabled={atEnd}
          aria-label="다음 액션"
          className="icon-button"
          onClick={() => {
            if (!atEnd) onStep(1)
          }}
          type="button"
        >
          <Next20Regular aria-hidden="true" />
        </button>
        <span aria-live="polite" className="replay-position">
          <strong className="numeric">
            {index + 1} / {total}
          </strong>
          <span>{streetLabels[street]}</span>
        </span>
      </div>

      <div aria-label="재생 속도" className="segmented" role="group">
        {speeds.map((option) => (
          <button
            aria-pressed={speed === option}
            key={option}
            onClick={() => onSpeedChange(option)}
            type="button"
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  )
}
