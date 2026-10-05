import type { CSSProperties } from 'react'

/** 좌석 순서대로 쓰는 아바타 색상(oklch hue) */
const AVATAR_HUES = [150, 30, 300, 90, 240, 200]

interface AvatarProps {
  name: string
  /** 좌석 순서(색을 고른다). 같은 사람은 화면이 달라도 같은 번호를 쓴다. */
  index?: number
  /** 나는 항상 강조색이다. */
  me?: boolean
  size?: number
  /** 폴드·탈락처럼 흐리게 보일 때 */
  muted?: boolean
  className?: string
}

/** 이름 첫 글자를 넣은 원형 아바타. 이름은 옆에 글자로 따로 쓰므로 보조기술에는 숨긴다. */
export function Avatar({ name, index = 0, me = false, size = 38, muted = false, className = '' }: AvatarProps) {
  const hue = AVATAR_HUES[((index % AVATAR_HUES.length) + AVATAR_HUES.length) % AVATAR_HUES.length]
  const style = {
    '--avatar-size': `${size}px`,
    '--avatar-hue': hue,
  } as CSSProperties
  const classes = ['avatar', me ? 'is-me' : '', muted ? 'is-muted' : '', className].filter(Boolean).join(' ')
  return (
    <span aria-hidden="true" className={classes} style={style}>
      {[...name.trim()][0] ?? '?'}
    </span>
  )
}
