export interface Contribution {
  playerId: string
  /** 이번 핸드에 낸 전체 칩 */
  amount: number
  folded: boolean
}

export interface Pot {
  amount: number
  /** 이 팟을 가져갈 자격이 있는(폴드하지 않은) 참가자 */
  eligible: string[]
}

/**
 * 각자 낸 칩으로 메인 팟과 사이드 팟을 나눈다.
 * 폴드한 사람의 칩도 팟에 들어가지만 가져갈 자격은 없다.
 */
export function buildPots(contributions: Contribution[]): Pot[] {
  const live = contributions.filter((item) => !item.folded && item.amount > 0)
  const levels = [...new Set(live.map((item) => item.amount))].sort((a, b) => a - b)
  const pots: Pot[] = []
  let previous = 0

  for (const level of levels) {
    const amount = contributions.reduce(
      (sum, item) => sum + Math.max(0, Math.min(item.amount, level) - Math.min(item.amount, previous)),
      0,
    )
    const eligible = live.filter((item) => item.amount >= level).map((item) => item.playerId)
    const last = pots[pots.length - 1]
    // 자격자가 같은 팟은 하나로 합친다.
    if (last && last.eligible.length === eligible.length && last.eligible.every((id) => eligible.includes(id))) {
      last.amount += amount
    } else if (amount > 0) {
      pots.push({ amount, eligible })
    }
    previous = level
  }

  // 가장 많이 낸 사람이 폴드한 경우처럼 남는 칩은 마지막 팟에 더한다.
  const leftover = contributions.reduce((sum, item) => sum + Math.max(0, item.amount - previous), 0)
  if (leftover > 0) {
    if (pots.length > 0) pots[pots.length - 1].amount += leftover
    else pots.push({ amount: leftover, eligible: [] })
  }

  return pots
}

/**
 * 팟을 승자끼리 나눈다. 나누어떨어지지 않는 칩은 `order`(딜러 왼쪽부터의 좌석 순서)에서
 * 앞선 승자부터 한 개씩 준다.
 */
export function splitPot(amount: number, winners: string[], order: string[]): Array<{ playerId: string; amount: number }> {
  const ordered = [...winners].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const share = Math.floor(amount / ordered.length)
  let remainder = amount - share * ordered.length
  return ordered.map((playerId) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { playerId, amount: share + extra }
  })
}
