import { Add20Regular, ArrowClockwise20Regular, Subtract20Regular } from '@fluentui/react-icons'
import { useId } from 'react'
import { formatChips } from '../../shared/format'
import {
  generateLevels,
  LEVEL_MINUTE_OPTIONS,
  level,
  MAX_LEVELS,
  MAX_PLAYERS,
  MIN_LEVELS,
  MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  SMALL_BLIND_PRESETS,
  STARTING_BB_PRESETS,
  blindSummary,
  startingStackInBigBlinds,
  TURN_SECONDS,
} from './settings'
import type { BlindMode, RoomSettings, RoomSettingsErrors } from './settings'
import './room.css'

const playerOptions = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => index + MIN_PLAYERS)

interface RoomSettingsFormProps {
  settings: RoomSettings
  errors: RoomSettingsErrors
  /** 제출을 한 번 시도한 뒤부터 오류를 보여준다. */
  showErrors: boolean
  /** 대기실에 이미 들어와 있는 인원. 이보다 적게 최대 인원을 줄일 수 없다. */
  headcount?: number
  onChange: (settings: RoomSettings) => void
}

export function RoomSettingsForm({ settings, errors, showErrors, headcount = 0, onChange }: RoomSettingsFormProps) {
  const id = useId()
  const nameError = showErrors ? errors.name : undefined
  const stackError = showErrors ? errors.startingStack : undefined
  const levelsError = showErrors ? errors.levels : undefined
  const firstSmallBlind = settings.levels[0]?.smallBlind ?? 0
  const bigBlindsDeep = firstSmallBlind > 0 ? startingStackInBigBlinds(settings) : 0

  const update = (patch: Partial<RoomSettings>) => onChange({ ...settings, ...patch })

  const setFirstSmallBlind = (smallBlind: number) => {
    const levels = [...settings.levels]
    levels[0] = level(smallBlind)
    update({ levels })
  }

  const setLevel = (index: number, smallBlind: number) => {
    const levels = settings.levels.map((item, itemIndex) => (itemIndex === index ? level(smallBlind) : item))
    update({ levels })
  }

  const setMode = (blindMode: BlindMode) => {
    // 인상으로 바꿀 때 레벨이 하나뿐이면 첫 블라인드로 레벨 표를 채워 준다.
    if (blindMode === 'increasing' && settings.levels.length < MIN_LEVELS) {
      update({ blindMode, levels: generateLevels(firstSmallBlind || 50) })
    } else {
      update({ blindMode })
    }
  }

  const applyPreset = (smallBlind: number) => {
    const stackInBigBlinds = bigBlindsDeep || 100
    update({
      levels: settings.blindMode === 'increasing' ? generateLevels(smallBlind, settings.levels.length) : [level(smallBlind), ...settings.levels.slice(1)],
      startingStack: smallBlind * 2 * stackInBigBlinds,
    })
  }

  const addLevel = () => {
    const last = settings.levels[settings.levels.length - 1]
    const next = generateLevels(firstSmallBlind, settings.levels.length + 1).at(-1)?.smallBlind ?? last.smallBlind * 2
    update({ levels: [...settings.levels, level(Math.max(next, last.smallBlind + firstSmallBlind))] })
  }

  return (
    <div className="room-form">
      <div className="room-form-row">
        <div className="field">
          <label htmlFor={`${id}-name`}>방 이름</label>
          <input
            aria-describedby={nameError ? `${id}-name-error` : undefined}
            aria-invalid={nameError ? true : undefined}
            id={`${id}-name`}
            maxLength={ROOM_NAME_MAX_LENGTH + 5}
            onChange={(event) => update({ name: event.target.value })}
            value={settings.name}
          />
          {nameError ? (
            <p className="field-error" id={`${id}-name-error`}>
              {nameError}
            </p>
          ) : null}
        </div>

        <fieldset className="field">
          <legend>최대 인원</legend>
          <div className="segmented">
            {playerOptions.map((count) => {
              const tooSmall = count < headcount
              return (
                <button
                  aria-describedby={tooSmall ? `${id}-players-hint` : undefined}
                  aria-disabled={tooSmall}
                  aria-pressed={settings.maxPlayers === count}
                  key={count}
                  onClick={() => {
                    if (!tooSmall) update({ maxPlayers: count })
                  }}
                  type="button"
                >
                  {count}명
                </button>
              )
            })}
          </div>
          {headcount > MIN_PLAYERS ? (
            <p className="field-hint" id={`${id}-players-hint`}>
              지금 {headcount}명이 있어 {headcount}명 미만으로 줄일 수 없습니다.
            </p>
          ) : null}
        </fieldset>
      </div>

      <div className="room-form-row">
        <div className="field">
          <label htmlFor={`${id}-stack`}>시작 칩</label>
          <div className="input-with-chips">
            <input
              aria-describedby={`${id}-stack-hint${stackError ? ` ${id}-stack-error` : ''}`}
              aria-invalid={stackError ? true : undefined}
              id={`${id}-stack`}
              inputMode="numeric"
              min={1}
              onChange={(event) => update({ startingStack: Number(event.target.value) })}
              step={firstSmallBlind || 1}
              type="number"
              value={Number.isFinite(settings.startingStack) ? settings.startingStack : ''}
            />
            <div aria-label="시작 칩 빠른 선택" className="chip-options" role="group">
              {STARTING_BB_PRESETS.map((bigBlinds) => {
                const amount = (settings.levels[0]?.bigBlind ?? 0) * bigBlinds
                return (
                  <button
                    aria-pressed={settings.startingStack === amount}
                    key={bigBlinds}
                    onClick={() => update({ startingStack: amount })}
                    type="button"
                  >
                    {bigBlinds}BB
                  </button>
                )
              })}
            </div>
          </div>
          {stackError ? (
            <p className="field-error" id={`${id}-stack-error`}>
              {stackError}
            </p>
          ) : null}
          <p className="field-hint" id={`${id}-stack-hint`}>
            첫 빅 블라인드 기준 {formatChips(bigBlindsDeep)}BB. 칩을 모두 잃으면 탈락합니다.
          </p>
        </div>

        <div className="field">
          <span className="field-label">고정 규칙</span>
          <ul className="fixed-rules">
            <li>차례 제한 시간 {TURN_SECONDS}초</li>
            <li>내 차례 음성 기록 · 세션 후 전체 패 공개</li>
            <li>게임 중 입장한 참가자는 다음 핸드부터</li>
          </ul>
        </div>
      </div>

      <fieldset className="blind-fieldset">
        <legend>블라인드</legend>

        <div className="blind-mode-row">
          <div className="radio-inline" role="radiogroup" aria-label="블라인드 방식">
            <label>
              <input
                checked={settings.blindMode === 'fixed'}
                name={`${id}-blind-mode`}
                onChange={() => setMode('fixed')}
                type="radio"
              />
              고정
            </label>
            <label>
              <input
                checked={settings.blindMode === 'increasing'}
                name={`${id}-blind-mode`}
                onChange={() => setMode('increasing')}
                type="radio"
              />
              시간마다 인상
            </label>
          </div>

          {settings.blindMode === 'increasing' ? (
            <label className="inline-select">
              <span>인상 간격</span>
              <select
                onChange={(event) => update({ levelMinutes: Number(event.target.value) })}
                value={settings.levelMinutes}
              >
                {LEVEL_MINUTE_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}분
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div aria-label="첫 블라인드 빠른 선택" className="chip-options" role="group">
            {SMALL_BLIND_PRESETS.map((smallBlind) => (
              <button
                aria-pressed={firstSmallBlind === smallBlind}
                key={smallBlind}
                onClick={() => applyPreset(smallBlind)}
                type="button"
              >
                {smallBlind}/{smallBlind * 2}
              </button>
            ))}
          </div>
        </div>

        {settings.blindMode === 'fixed' ? (
          <div className="blind-fixed">
            <label htmlFor={`${id}-sb`}>스몰 블라인드</label>
            <input
              aria-describedby={levelsError ? `${id}-levels-error` : undefined}
              aria-invalid={levelsError ? true : undefined}
              id={`${id}-sb`}
              inputMode="numeric"
              min={1}
              onChange={(event) => setFirstSmallBlind(Number(event.target.value))}
              type="number"
              value={Number.isFinite(firstSmallBlind) ? firstSmallBlind : ''}
            />
            <span className="blind-bb">
              빅 블라인드 <strong className="numeric">{formatChips(firstSmallBlind * 2)}</strong>
            </span>
          </div>
        ) : (
          <>
            <ol aria-label="블라인드 레벨" className="level-grid">
              {settings.levels.map((item, index) => (
                <li key={index}>
                  <label htmlFor={`${id}-level-${index}`}>레벨 {index + 1}</label>
                  <span className="level-inputs">
                    <input
                      aria-describedby={`${id}-level-${index}-bb`}
                      aria-invalid={levelsError ? true : undefined}
                      id={`${id}-level-${index}`}
                      inputMode="numeric"
                      min={1}
                      onChange={(event) => setLevel(index, Number(event.target.value))}
                      type="number"
                      value={Number.isFinite(item.smallBlind) ? item.smallBlind : ''}
                    />
                    <span className="numeric" id={`${id}-level-${index}-bb`}>
                      / {formatChips(item.bigBlind)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="level-actions">
              <button
                aria-disabled={settings.levels.length >= MAX_LEVELS}
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  if (settings.levels.length < MAX_LEVELS) addLevel()
                }}
                type="button"
              >
                <Add20Regular aria-hidden="true" />
                레벨 추가
              </button>
              <button
                aria-disabled={settings.levels.length <= MIN_LEVELS}
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  if (settings.levels.length > MIN_LEVELS) update({ levels: settings.levels.slice(0, -1) })
                }}
                type="button"
              >
                <Subtract20Regular aria-hidden="true" />
                마지막 레벨 삭제
              </button>
              <button
                className="btn btn--secondary btn--sm"
                onClick={() => update({ levels: generateLevels(firstSmallBlind || 50, settings.levels.length) })}
                type="button"
              >
                <ArrowClockwise20Regular aria-hidden="true" />
                1.5배씩 다시 채우기
              </button>
              <span className="field-hint">마지막 레벨에 닿으면 그 블라인드를 유지합니다.</span>
            </div>
          </>
        )}

        {levelsError ? (
          <p className="field-error" id={`${id}-levels-error`}>
            {levelsError}
          </p>
        ) : (
          <p className="blind-summary">{blindSummary(settings)}</p>
        )}
      </fieldset>
    </div>
  )
}
