import {
  CheckmarkCircle20Filled,
  Circle20Regular,
  Clock20Regular,
  Mic20Regular,
  ShieldCheckmark20Regular,
  Warning20Filled,
} from '@fluentui/react-icons'
import { useEffect, useId } from 'react'
import { canBeReady } from '../../app/flow'
import type { ConsentState, MicCheckStatus } from '../../app/flow'
import { PrepLayout } from './PrepLayout'

export const MIC_CHECK_DURATION_MS = 1200

const LEVEL_BARS = 12
const MOCK_INPUT_LEVEL = 7

const statusCopy: Record<MicCheckStatus, { title: string; detail: string }> = {
  idle: {
    title: '마이크를 점검해 주세요',
    detail: '점검을 시작하면 브라우저가 마이크 권한을 요청합니다. 점검 중 소리는 저장되지 않습니다.',
  },
  checking: {
    title: '마이크를 확인하는 중…',
    detail: '평소 말하는 크기로 한두 마디 말해 보세요.',
  },
  ready: {
    title: '마이크가 정상입니다',
    detail: '기본 마이크 · 입력이 감지되었습니다. 내 차례가 시작되면 자동으로 기록됩니다.',
  },
  denied: {
    title: '마이크 권한이 거부되었습니다',
    detail: '주소창 왼쪽의 사이트 정보 아이콘에서 마이크를 허용한 뒤 다시 점검하세요.',
  },
  'not-found': {
    title: '마이크를 찾을 수 없습니다',
    detail: '마이크나 헤드셋을 연결한 뒤 다시 점검하세요.',
  },
}

export function micStatusLabel(status: MicCheckStatus, voiceless: boolean) {
  if (status === 'ready') return '정상'
  if (voiceless) return '음성 없이 참여'
  if (status === 'checking') return '확인 중'
  if (status === 'denied') return '권한 거부'
  if (status === 'not-found') return '장치 없음'
  return '점검 전'
}

interface MicCheckScreenProps {
  nickname: string
  seatNumber?: number
  consent: ConsentState
  micStatus: MicCheckStatus
  voiceless: boolean
  onStartCheck: () => void
  onCheckFinished: () => void
  onVoicelessChange: (voiceless: boolean) => void
  onBack: () => void
  onReady: () => void
}

export function MicCheckScreen({
  nickname,
  seatNumber,
  consent,
  micStatus,
  voiceless,
  onStartCheck,
  onCheckFinished,
  onVoicelessChange,
  onBack,
  onReady,
}: MicCheckScreenProps) {
  const reasonId = useId()
  const voicelessDetailId = useId()
  const voicelessTitleId = useId()
  const ready = canBeReady({ consent, micStatus, voiceless })
  const hasProblem = micStatus === 'denied' || micStatus === 'not-found'
  const copy = statusCopy[micStatus]

  useEffect(() => {
    if (micStatus !== 'checking') return
    const timer = window.setTimeout(onCheckFinished, MIC_CHECK_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [micStatus, onCheckFinished])

  const StatusIcon =
    micStatus === 'ready' ? CheckmarkCircle20Filled : hasProblem ? Warning20Filled : micStatus === 'checking' ? Clock20Regular : Mic20Regular

  const checklist = [
    { label: '녹음·전체 패 공개 동의', done: consent.recording && consent.reveal },
    {
      label: voiceless && micStatus !== 'ready' ? '음성 없이 참여 선택' : '마이크 정상 확인',
      done: micStatus === 'ready' || voiceless,
    },
  ]

  return (
    <PrepLayout
      nickname={nickname}
      screen="mic"
      seatNumber={seatNumber}
      selfMicLabel={micStatusLabel(micStatus, voiceless)}
      title="마이크를 점검합니다"
    >
      <div className="prep-panel">
        <section
          aria-labelledby="mic-status-title"
          className={`mic-status mic-status--${micStatus}`}
          data-testid="mic-status"
        >
          <StatusIcon aria-hidden="true" className="mic-status-icon" />
          <div aria-live="polite" className="mic-status-text">
            <h2 id="mic-status-title">{copy.title}</h2>
            <p>{copy.detail}</p>
          </div>
          {micStatus === 'ready' ? (
            <div aria-label={`입력 수준 ${LEVEL_BARS}단계 중 ${MOCK_INPUT_LEVEL}단계, 적정`} className="level-meter" role="img">
              {Array.from({ length: LEVEL_BARS }, (_, index) => (
                <span className={index < MOCK_INPUT_LEVEL ? 'is-on' : ''} key={index} />
              ))}
            </div>
          ) : null}
          <button
            aria-disabled={micStatus === 'checking'}
            className="btn btn--secondary"
            onClick={() => {
              if (micStatus !== 'checking') onStartCheck()
            }}
            type="button"
          >
            {micStatus === 'idle' ? '마이크 점검 시작' : micStatus === 'checking' ? '확인 중…' : '다시 점검'}
          </button>
        </section>

        {micStatus === 'ready' ? null : (
          <label className={`consent-item voiceless-option ${voiceless ? 'is-checked' : ''}`}>
            <input
              aria-describedby={voicelessDetailId}
              aria-labelledby={voicelessTitleId}
              checked={voiceless}
              onChange={(event) => onVoicelessChange(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong id={voicelessTitleId}>음성 없이 참여</strong>
              <span id={voicelessDetailId}>
                내 차례 음성이 기록되지 않고, 복기에서 내 차례는 ‘음성 없이 참여’로 표시됩니다. 게임은 똑같이 할 수 있습니다.
              </span>
            </span>
          </label>
        )}

        <ul aria-label="준비 조건" className="ready-checklist">
          {checklist.map((item) => (
            <li className={item.done ? 'is-done' : ''} key={item.label}>
              {item.done ? <CheckmarkCircle20Filled aria-hidden="true" /> : <Circle20Regular aria-hidden="true" />}
              <span>{item.label}</span>
              <span className="visually-hidden">{item.done ? '완료' : '미완료'}</span>
            </li>
          ))}
        </ul>

        <div className="notice">
          <ShieldCheckmark20Regular aria-hidden="true" />
          <p>마이크 상태는 나에게만 표시됩니다. 다른 참가자에게는 준비 여부와 연결 상태만 공개됩니다.</p>
        </div>

        <div className="prep-actions">
          {ready ? null : (
            <p className="prep-actions-reason" id={reasonId}>
              마이크 점검을 마치거나 ‘음성 없이 참여’를 선택하세요.
            </p>
          )}
          <button className="btn btn--secondary" onClick={onBack} type="button">
            이전
          </button>
          <button
            aria-describedby={ready ? undefined : reasonId}
            aria-disabled={!ready}
            className="btn btn--primary"
            onClick={() => {
              if (ready) onReady()
            }}
            type="button"
          >
            준비 완료
          </button>
        </div>
      </div>
    </PrepLayout>
  )
}
