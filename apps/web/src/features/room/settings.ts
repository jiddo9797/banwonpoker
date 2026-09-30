import { formatChips } from '../../shared/format'

export interface BlindLevel {
  smallBlind: number
  /** 빅 블라인드는 항상 스몰 블라인드의 두 배다. */
  bigBlind: number
}

export type BlindMode = 'fixed' | 'increasing'

/** 방장이 방을 만들 때 정하는 규칙. 게임이 시작되면 바꿀 수 없다. */
export interface RoomSettings {
  name: string
  maxPlayers: number
  startingStack: number
  blindMode: BlindMode
  /** 고정이면 첫 레벨만 쓴다. */
  levels: BlindLevel[]
  /** 블라인드 인상 간격(분). 고정이면 쓰지 않는다. */
  levelMinutes: number
}

export const TURN_SECONDS = 60
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const ROOM_NAME_MAX_LENGTH = 20
export const MIN_LEVELS = 2
export const MAX_LEVELS = 15
export const MIN_STARTING_BB = 20
export const MAX_STARTING_STACK = 1_000_000
export const LEVEL_MINUTE_OPTIONS = [5, 10, 15, 20, 30] as const
export const SMALL_BLIND_PRESETS = [25, 50, 100, 200] as const
export const STARTING_BB_PRESETS = [50, 100, 200] as const

export function level(smallBlind: number): BlindLevel {
  return { smallBlind, bigBlind: smallBlind * 2 }
}

/** 첫 스몰 블라인드부터 대략 1.5배씩 오르는 레벨 표를 만든다. 금액은 첫 블라인드 단위로 반올림한다. */
export function generateLevels(firstSmallBlind: number, count = 8): BlindLevel[] {
  const levels: BlindLevel[] = [level(firstSmallBlind)]
  while (levels.length < count) {
    const previous = levels[levels.length - 1].smallBlind
    const next = Math.max(previous + firstSmallBlind, Math.round((previous * 1.5) / firstSmallBlind) * firstSmallBlind)
    levels.push(level(next))
  }
  return levels
}

export const defaultRoomSettings: RoomSettings = {
  name: '금요일 밤 홀덤',
  maxPlayers: 6,
  startingStack: 10_000,
  blindMode: 'fixed',
  levels: generateLevels(50),
  levelMinutes: 15,
}

export type RoomSettingsErrors = Partial<Record<'name' | 'startingStack' | 'levels', string>>

export function validateRoomSettings(settings: RoomSettings): RoomSettingsErrors {
  const errors: RoomSettingsErrors = {}
  const name = settings.name.trim()
  const firstLevel = settings.levels[0]

  if (name.length === 0) errors.name = '방 이름을 입력하세요.'
  else if (name.length > ROOM_NAME_MAX_LENGTH) errors.name = `방 이름은 ${ROOM_NAME_MAX_LENGTH}자 이하로 입력하세요.`

  if (!firstLevel || !Number.isInteger(firstLevel.smallBlind) || firstLevel.smallBlind < 1) {
    errors.levels = '스몰 블라인드는 1 이상의 정수여야 합니다.'
  } else if (settings.blindMode === 'increasing') {
    if (settings.levels.length < MIN_LEVELS) errors.levels = `인상하려면 레벨이 ${MIN_LEVELS}개 이상 필요합니다.`
    else if (settings.levels.some((item) => !Number.isInteger(item.smallBlind) || item.smallBlind < 1)) {
      errors.levels = '모든 레벨의 스몰 블라인드는 1 이상의 정수여야 합니다.'
    } else {
      const brokenAt = settings.levels.findIndex(
        (item, index) => index > 0 && item.smallBlind <= settings.levels[index - 1].smallBlind,
      )
      if (brokenAt > 0) errors.levels = `레벨 ${brokenAt + 1}은 레벨 ${brokenAt}보다 커야 합니다.`
    }
  }

  if (firstLevel && !errors.levels) {
    const minimumStack = firstLevel.bigBlind * MIN_STARTING_BB
    if (!Number.isInteger(settings.startingStack) || settings.startingStack < minimumStack) {
      errors.startingStack = `시작 칩은 첫 빅 블라인드의 ${MIN_STARTING_BB}배(${formatChips(minimumStack)}) 이상이어야 합니다.`
    } else if (settings.startingStack > MAX_STARTING_STACK) {
      errors.startingStack = `시작 칩은 ${formatChips(MAX_STARTING_STACK)} 이하로 정하세요.`
    }
  }

  return errors
}

export function hasErrors(errors: RoomSettingsErrors) {
  return Object.keys(errors).length > 0
}

export function formatBlinds(blindLevel: BlindLevel) {
  return `${formatChips(blindLevel.smallBlind)} / ${formatChips(blindLevel.bigBlind)}`
}

/** 대기실·테이블에서 쓰는 블라인드 방식 요약 */
export function blindSummary(settings: RoomSettings) {
  if (settings.blindMode === 'fixed') return `${formatBlinds(settings.levels[0])} 고정`
  return `${formatBlinds(settings.levels[0])}부터 ${settings.levelMinutes}분마다 인상 · ${settings.levels.length}레벨`
}

/** 테이블 헤더에 붙는 다음 레벨 안내. 고정이면 없다. */
export function nextLevelNote(settings: RoomSettings, minutesLeft = settings.levelMinutes) {
  if (settings.blindMode === 'fixed') return undefined
  const next = settings.levels[1]
  return next ? `레벨 1 · ${minutesLeft}분 뒤 ${formatBlinds(next)}` : undefined
}

export function startingStackInBigBlinds(settings: RoomSettings) {
  return Math.floor(settings.startingStack / settings.levels[0].bigBlind)
}
