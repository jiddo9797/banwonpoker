export interface BlindLevel {
  smallBlind: number
  bigBlind: number
}

/** 방장이 정한 블라인드 구조. 고정이면 첫 레벨만 쓴다. */
export interface BlindSchedule {
  mode: 'fixed' | 'increasing'
  levels: BlindLevel[]
  /** 레벨 하나의 길이(밀리초). 인상 방식에서만 쓴다. */
  levelDurationMs: number
}

/** 게임 시작 후 `elapsedMs`가 지났을 때의 레벨 번호(0부터). 마지막 레벨에 닿으면 그대로 유지한다. */
export function blindLevelIndexAt(schedule: BlindSchedule, elapsedMs: number): number {
  if (schedule.mode === 'fixed' || schedule.levelDurationMs <= 0) return 0
  const index = Math.floor(Math.max(0, elapsedMs) / schedule.levelDurationMs)
  return Math.min(index, schedule.levels.length - 1)
}

export function blindLevelAt(schedule: BlindSchedule, elapsedMs: number): BlindLevel {
  return schedule.levels[blindLevelIndexAt(schedule, elapsedMs)]
}

/** 다음 레벨까지 남은 시간(밀리초). 고정이거나 마지막 레벨이면 없다. */
export function msUntilNextLevel(schedule: BlindSchedule, elapsedMs: number): number | undefined {
  const index = blindLevelIndexAt(schedule, elapsedMs)
  if (schedule.mode === 'fixed' || index >= schedule.levels.length - 1) return undefined
  return (index + 1) * schedule.levelDurationMs - Math.max(0, elapsedMs)
}
