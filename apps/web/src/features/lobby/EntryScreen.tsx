import { Info20Regular } from '@fluentui/react-icons'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { NICKNAME_MAX_LENGTH, validateNickname } from './fixtures'
import { PrepLayout } from './PrepLayout'
import type { PrepContext } from './PrepLayout'

interface EntryScreenProps {
  context: PrepContext
  initialNickname?: string
  onSubmit: (nickname: string) => void
  onCreateRoom: () => void
}

export function EntryScreen({ context, initialNickname = '', onSubmit, onCreateRoom }: EntryScreenProps) {
  const [nickname, setNickname] = useState(initialNickname)
  const [error, setError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const errorId = useId()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validateNickname(nickname)
    setError(validationError)
    if (validationError) {
      inputRef.current?.focus()
      return
    }
    onSubmit(nickname)
  }

  return (
    <PrepLayout {...context} screen="entry" title="테이블에 입장합니다">
      <form className="prep-panel" noValidate onSubmit={submit}>
        <p className="prep-lead">
          친구가 보낸 초대 링크로 들어왔습니다. 테이블과 복기 화면에 표시될 닉네임을 정해 주세요.
        </p>

        <div className="field">
          <label htmlFor="nickname">닉네임</label>
          <input
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            aria-invalid={error ? true : undefined}
            autoComplete="nickname"
            id="nickname"
            maxLength={NICKNAME_MAX_LENGTH + 4}
            onChange={(event) => {
              setNickname(event.target.value)
              if (error) setError(undefined)
            }}
            ref={inputRef}
            value={nickname}
          />
          {error ? (
            <p className="field-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <p className="field-hint" id={hintId}>
            2~{NICKNAME_MAX_LENGTH}자. 방 안에서 겹치지 않아야 합니다.
          </p>
        </div>

        <div className="notice">
          <Info20Regular aria-hidden="true" />
          <p>
            이 방은 차례별 음성 기록으로 복기합니다. 다음 단계에서 녹음과 전체 패 공개 동의를 받습니다.
          </p>
        </div>

        <div className="prep-actions">
          <p className="prep-actions-reason">
            초대 링크 없이 새로 시작하려면{' '}
            <button className="link-button" onClick={onCreateRoom} type="button">
              새 방 만들기
            </button>
          </p>
          <button className="btn btn--primary" type="submit">
            입장하기
          </button>
        </div>
      </form>
    </PrepLayout>
  )
}
