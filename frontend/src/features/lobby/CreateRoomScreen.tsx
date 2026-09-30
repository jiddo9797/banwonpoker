import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RoomSettingsForm } from '../room/RoomSettingsForm'
import { hasErrors, validateRoomSettings } from '../room/settings'
import type { RoomSettings } from '../room/settings'
import { NICKNAME_MAX_LENGTH, validateNickname } from './fixtures'
import { PrepLayout } from './PrepLayout'

interface CreateRoomScreenProps {
  initialSettings: RoomSettings
  initialNickname?: string
  onCreate: (nickname: string, settings: RoomSettings) => void
  onBack: () => void
}

export function CreateRoomScreen({ initialSettings, initialNickname = '', onCreate, onBack }: CreateRoomScreenProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [nickname, setNickname] = useState(initialNickname)
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const nicknameErrorId = useId()

  const nicknameError = submitted ? validateNickname(nickname) : undefined
  const settingsErrors = validateRoomSettings(settings)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    if (validateNickname(nickname) || hasErrors(settingsErrors)) {
      // 오류 문구가 그려진 다음 첫 번째 잘못된 칸으로 포커스를 옮긴다.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    onCreate(nickname, settings)
  }

  return (
    <PrepLayout hostName={nickname.trim()} role="host" room={settings} screen="create" title="새 방을 만듭니다">
      <form className="prep-panel prep-panel--compact" noValidate onSubmit={submit} ref={formRef}>
        <div className="field">
          <label htmlFor="host-nickname">내 닉네임 (방장)</label>
          <input
            aria-describedby={nicknameError ? nicknameErrorId : undefined}
            aria-invalid={nicknameError ? true : undefined}
            autoComplete="nickname"
            id="host-nickname"
            maxLength={NICKNAME_MAX_LENGTH + 4}
            onChange={(event) => setNickname(event.target.value)}
            value={nickname}
          />
          {nicknameError ? (
            <p className="field-error" id={nicknameErrorId}>
              {nicknameError}
            </p>
          ) : null}
        </div>

        <RoomSettingsForm errors={settingsErrors} onChange={setSettings} settings={settings} showErrors={submitted} />

        <div className="prep-actions">
          <p className="prep-actions-reason">설정은 게임을 시작하기 전까지 대기실에서 바꿀 수 있습니다.</p>
          <button className="btn btn--secondary" onClick={onBack} type="button">
            취소
          </button>
          <button className="btn btn--primary" type="submit">
            방 만들기
          </button>
        </div>
      </form>
    </PrepLayout>
  )
}
