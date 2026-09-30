import type { BlindSchedule } from '@banwonpoker/engine'
import type { RoomSettings } from './protocol'

export const TURN_MS = 60_000
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const ROOM_NAME_MAX_LENGTH = 20
export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 8
export const MAX_LEVELS = 15
export const MIN_STARTING_BB = 20
export const MAX_STARTING_STACK = 1_000_000
export const LEVEL_MINUTE_OPTIONS = [5, 10, 15, 20, 30]

const chips = new Intl.NumberFormat('ko-KR')

/** 방 설정 검증. 프론트엔드의 방 만들기 화면과 같은 규칙이다. 올바르면 undefined */
export function validateSettings(settings: RoomSettings): string | undefined {
  const name = settings.name.trim()
  if (name.length === 0) return '방 이름을 입력하세요.'
  if (name.length > ROOM_NAME_MAX_LENGTH) return `방 이름은 ${ROOM_NAME_MAX_LENGTH}자 이하로 입력하세요.`
  if (settings.maxPlayers < MIN_PLAYERS || settings.maxPlayers > MAX_PLAYERS) {
    return `최대 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명입니다.`
  }

  const levels = settings.blindMode === 'fixed' ? settings.levels.slice(0, 1) : settings.levels
  if (settings.blindMode === 'increasing') {
    if (levels.length < 2) return '인상하려면 레벨이 2개 이상 필요합니다.'
    if (levels.length > MAX_LEVELS) return `레벨은 ${MAX_LEVELS}개까지 만들 수 있습니다.`
    if (!LEVEL_MINUTE_OPTIONS.includes(settings.levelMinutes)) return '인상 간격이 올바르지 않습니다.'
  }
  for (const [index, level] of levels.entries()) {
    if (level.smallBlind < 1 || level.bigBlind !== level.smallBlind * 2) {
      return '빅 블라인드는 스몰 블라인드의 두 배여야 합니다.'
    }
    if (index > 0 && level.smallBlind <= levels[index - 1].smallBlind) {
      return `레벨 ${index + 1}은 레벨 ${index}보다 커야 합니다.`
    }
  }

  const minimumStack = levels[0].bigBlind * MIN_STARTING_BB
  if (settings.startingStack < minimumStack) {
    return `시작 칩은 첫 빅 블라인드의 ${MIN_STARTING_BB}배(${chips.format(minimumStack)}) 이상이어야 합니다.`
  }
  if (settings.startingStack > MAX_STARTING_STACK) return `시작 칩은 ${chips.format(MAX_STARTING_STACK)} 이하로 정하세요.`
  return undefined
}

/** 저장할 때는 공백을 다듬고, 고정 블라인드면 첫 레벨만 남긴다. */
export function normalizeSettings(settings: RoomSettings): RoomSettings {
  return {
    ...settings,
    name: settings.name.trim(),
    levels: (settings.blindMode === 'fixed' ? settings.levels.slice(0, 1) : settings.levels).map((level) => ({ ...level })),
  }
}

export function scheduleOf(settings: RoomSettings): BlindSchedule {
  return {
    mode: settings.blindMode,
    levels: settings.levels,
    levelDurationMs: settings.levelMinutes * 60_000,
  }
}

export function validateNickname(nickname: string): string | undefined {
  const trimmed = nickname.trim()
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
    return `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 정하세요.`
  }
  return undefined
}
