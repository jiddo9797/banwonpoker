import { LockClosed20Regular } from '@fluentui/react-icons'
import { useId } from 'react'
import type { ConsentState } from '../../app/flow'
import { PrepLayout } from './PrepLayout'

interface ConsentScreenProps {
  nickname: string
  seatNumber?: number
  consent: ConsentState
  onChange: (key: keyof ConsentState, value: boolean) => void
  onBack: () => void
  onNext: () => void
}

const consentItems: Array<{ key: keyof ConsentState; title: string; detail: string }> = [
  {
    key: 'recording',
    title: '내 차례 음성 기록에 동의합니다',
    detail:
      '내 차례가 시작되면 내 브라우저에서만 녹음이 자동으로 시작되고, 액션·시간 초과·퇴장 시 끝납니다. 플레이 중에는 누구에게도 전달되지 않습니다.',
  },
  {
    key: 'reveal',
    title: '세션 종료 후 전체 패 공개에 동의합니다',
    detail: '복기 화면에서 모든 참가자의 홀카드와 차례별 음성이 이 방 참가자 전원에게 공개됩니다.',
  },
]

export function ConsentScreen({ nickname, seatNumber, consent, onChange, onBack, onNext }: ConsentScreenProps) {
  const reasonId = useId()
  const itemId = useId()
  const complete = consent.recording && consent.reveal

  return (
    <PrepLayout nickname={nickname} screen="consent" seatNumber={seatNumber} title="녹음과 패 공개에 동의해 주세요">
      <div className="prep-panel">
        <p className="prep-lead">두 항목 모두 이 방에서 플레이하기 위한 필수 조건입니다.</p>

        <fieldset className="consent-list">
          <legend className="visually-hidden">필수 동의 항목</legend>
          {consentItems.map((item) => (
            <label className={`consent-item ${consent[item.key] ? 'is-checked' : ''}`} key={item.key}>
              <input
                aria-describedby={`${itemId}-${item.key}-detail`}
                aria-labelledby={`${itemId}-${item.key}-title`}
                checked={consent[item.key]}
                onChange={(event) => onChange(item.key, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong id={`${itemId}-${item.key}-title`}>
                  {item.title} <span className="required-mark">(필수)</span>
                </strong>
                <span id={`${itemId}-${item.key}-detail`}>{item.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="notice">
          <LockClosed20Regular aria-hidden="true" />
          <p>기록된 음성은 세션이 끝나기 전까지 누구도 들을 수 없습니다. 상대의 녹음 여부도 플레이 중에는 표시되지 않습니다.</p>
        </div>

        <div className="prep-actions">
          {complete ? null : (
            <p className="prep-actions-reason" id={reasonId}>
              두 항목에 모두 동의해야 다음 단계로 갈 수 있습니다.
            </p>
          )}
          <button className="btn btn--secondary" onClick={onBack} type="button">
            이전
          </button>
          <button
            aria-describedby={complete ? undefined : reasonId}
            aria-disabled={!complete}
            className="btn btn--primary"
            onClick={() => {
              if (complete) onNext()
            }}
            type="button"
          >
            다음: 마이크 점검
          </button>
        </div>
      </div>
    </PrepLayout>
  )
}
