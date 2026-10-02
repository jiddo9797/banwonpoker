import type { CSSProperties } from 'react'

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

interface AudioScrubberProps {
  /** 지금 칸에 들을 음성이 있는지 */
  available: boolean
  current: number
  duration: number
  onSeek: (seconds: number) => void
}

/** 지금 칸의 음성에서 원하는 지점으로 옮기는 막대. 음악 앱의 재생 위치 막대처럼 끌거나 눌러서 옮긴다. */
export function AudioScrubber({ available, current, duration, onSeek }: AudioScrubberProps) {
  const total = available ? Math.max(duration, 0) : 0
  const position = Math.min(current, total)
  const percent = total > 0 ? (position / total) * 100 : 0

  return (
    <div className={`audio-scrubber ${available ? '' : 'is-empty'}`}>
      <span aria-hidden="true" className="numeric">
        {clock(position)}
      </span>
      <input
        aria-label="음성 위치"
        aria-valuetext={available ? `${clock(position)} / ${clock(total)}` : '이 칸에는 들을 음성이 없습니다'}
        disabled={!available || total === 0}
        max={total || 1}
        min={0}
        onChange={(event) => onSeek(Number(event.target.value))}
        step={0.1}
        style={{ '--scrub-percent': `${percent}%` } as CSSProperties}
        type="range"
        value={position}
      />
      <span aria-hidden="true" className="numeric">
        {available ? clock(total) : '음성 없음'}
      </span>
    </div>
  )
}
