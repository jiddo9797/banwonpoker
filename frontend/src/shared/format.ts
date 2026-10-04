const chipFormatter = new Intl.NumberFormat('ko-KR')

export function formatChips(value: number) {
  return chipFormatter.format(value)
}

export function formatSignedChips(value: number) {
  if (value === 0) return '±0'
  return `${value > 0 ? '+' : '−'}${formatChips(Math.abs(value))}`
}

export function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`
}

/** 칩을 빅 블라인드 수로. 100BB 미만은 소수 한 자리까지. 예: `2.5BB`, `37.5BB`, `150BB` */
export function formatBb(chips: number, bigBlind: number) {
  const value = chips / bigBlind
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded}BB`
}
