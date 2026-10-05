import {
  ErrorCircle20Regular,
  MicOff20Regular,
  Speaker220Regular,
  SpeakerOff20Regular,
  Subtract20Regular,
  Warning20Regular,
} from '@fluentui/react-icons'
import type { AudioStatus } from '../model'

const statusMeta: Record<AudioStatus, { label: string; description: string; Icon: typeof Speaker220Regular }> = {
  voice: { label: '음성', description: '차례 중 음성이 저장되었습니다.', Icon: Speaker220Regular },
  silent: { label: '무발언', description: '기록은 정상이지만 말한 내용이 없습니다.', Icon: SpeakerOff20Regular },
  failed: { label: '기록 실패', description: '녹음이나 업로드가 실패했습니다.', Icon: Warning20Regular },
  missing: { label: '누락', description: '기록이 서버에 도착하지 않았습니다.', Icon: ErrorCircle20Regular },
  voiceless: { label: '음성 없이 참여', description: '참가자가 음성 없이 참여를 선택했습니다.', Icon: MicOff20Regular },
  none: { label: '음성 없음', description: '블라인드나 결과처럼 음성이 없는 칸입니다.', Icon: Subtract20Regular },
}

export const audioStatusOrder: AudioStatus[] = ['voice', 'silent', 'failed', 'missing', 'voiceless']

export function audioStatusLabel(status: AudioStatus, seconds?: number) {
  const { label } = statusMeta[status]
  return status === 'voice' && seconds !== undefined ? `${label} ${seconds}초` : label
}

export function audioStatusDescription(status: AudioStatus) {
  return statusMeta[status].description
}

interface AudioTrackStatusProps {
  status: AudioStatus
  seconds?: number
  className?: string
}

export function AudioTrackStatus({ status, seconds, className = '' }: AudioTrackStatusProps) {
  const { Icon } = statusMeta[status]

  return (
    <span className={`audio-status audio-status--${status} ${className}`}>
      <Icon aria-hidden="true" />
      <span>{audioStatusLabel(status, seconds)}</span>
    </span>
  )
}

/** 타임라인 칸의 음성 상태 막대 색 묶음 */
export function audioTone(status: AudioStatus): 'voice' | 'quiet' | 'problem' | 'none' {
  if (status === 'voice') return 'voice'
  if (status === 'failed' || status === 'missing') return 'problem'
  if (status === 'none') return 'none'
  return 'quiet'
}

/** 재생 줄 오른쪽의 음성 상태 범례. 타임라인 칸 아래 막대 색과 같다. */
export function AudioLegend() {
  return (
    <ul aria-label="음성 상태 범례" className="audio-legend">
      <li className="is-voice">
        <span aria-hidden="true" />
        음성
      </li>
      <li className="is-quiet">
        <span aria-hidden="true" />
        무발언
      </li>
      <li className="is-problem">
        <span aria-hidden="true" />
        기록 실패 · 누락
      </li>
    </ul>
  )
}
