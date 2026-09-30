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
