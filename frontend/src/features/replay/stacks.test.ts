import { describe, expect, it } from 'vitest'
import { getReplayHand, HERO_ID } from './fixtures'
import { stackAt, stackFactAt, streetBetAt, winnerOf } from './stacks'

const hand24 = getReplayHand(24)
const RESULT = hand24.actions.length - 1

describe('stackAt', () => {
  it('시작 칩에서 그 칸까지 낸 칩을 빼고, 결과 칸에서는 받은 칩을 더한다', () => {
    expect(stackAt(hand24, HERO_ID, 0)).toBe(14_350)
    // 프리플랍 콜 100, 플랍 콜 900
    expect(stackAt(hand24, HERO_ID, 12)).toBe(13_350)
    expect(stackAt(hand24, HERO_ID, RESULT - 1)).toBe(14_350 - 2_550)
    expect(stackAt(hand24, HERO_ID, RESULT)).toBe(14_350 - 2_550 + 6_650)
    expect(stackAt(hand24, 'subin', RESULT)).toBe(10_500 - 2_550)
  })

  it('시작 칩 기록이 없으면 undefined', () => {
    expect(stackAt({ ...hand24, startStacks: {} }, HERO_ID, 3)).toBeUndefined()
  })
})

describe('streetBetAt', () => {
  it('이번 스트리트에 낸 칩만 더하고, 결과 칸에서는 0이다', () => {
    expect(streetBetAt(hand24, 'seojun', 1)).toBe(100)
    // 플랍 베팅 300 뒤 콜 900(추가 600)
    expect(streetBetAt(hand24, 'seojun', 12)).toBe(300)
    expect(streetBetAt(hand24, 'seojun', 13)).toBe(900)
    // 폴드한 뒤에도 이미 낸 칩은 남는다
    expect(streetBetAt(hand24, 'minsu', 14)).toBe(300)
    expect(streetBetAt(hand24, 'seojun', 15)).toBe(0)
    expect(streetBetAt(hand24, HERO_ID, RESULT)).toBe(0)
  })
})

describe('stackFactAt', () => {
  it('액션 칸은 액션한 사람이 낸 만큼 줄고, 결과 칸은 승자가 받은 만큼 는다', () => {
    expect(stackFactAt(hand24, 12)).toEqual({ playerId: HERO_ID, stack: 13_350, change: -900 })
    expect(stackFactAt(hand24, 7)).toEqual({ playerId: 'seojun', stack: 4_100, change: 0 })
    expect(winnerOf(hand24)).toBe(HERO_ID)
    expect(stackFactAt(hand24, RESULT)).toEqual({ playerId: HERO_ID, stack: 18_450, change: 6_650 })
  })
})
