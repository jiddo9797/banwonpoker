import { describe, expect, it } from 'vitest'
import { getTableSnapshot, tableFixtures } from './fixtures'
import { isScenarioKey, scenarioKeys } from './model'
import type { Seat } from './model'

/** 상대 좌석 모델에 허용하는 필드. 녹음·마이크·업로드 관련 필드가 끼어들면 실패한다. */
const allowedSeatFields = new Set<keyof Seat>([
  'id',
  'name',
  'stack',
  'position',
  'badge',
  'bet',
  'checked',
  'status',
  'isTurn',
  'remainingSeconds',
  'showdownCards',
  'handRank',
  'isWinner',
])

describe('테이블 fixture', () => {
  it('8개 시나리오가 모두 있고 key가 일치한다', () => {
    expect(Object.keys(tableFixtures)).toEqual([...scenarioKeys])
    for (const key of scenarioKeys) {
      expect(tableFixtures[key].key).toBe(key)
    }
  })

  it('URL 값 검증은 알려진 시나리오만 통과시킨다', () => {
    expect(isScenarioKey('showdown')).toBe(true)
    expect(isScenarioKey('SHOWDOWN')).toBe(false)
    expect(isScenarioKey(null)).toBe(false)
  })

  it.each(scenarioKeys)('%s: 상대 좌석에 녹음 관련 필드가 없다', (key) => {
    for (const seat of tableFixtures[key].seats) {
      for (const field of Object.keys(seat)) {
        expect(allowedSeatFields.has(field as keyof Seat), `${seat.name}.${field}`).toBe(true)
      }
      expect(JSON.stringify(seat)).not.toMatch(/mic|record|upload|audio|voice/i)
    }
  })

  it.each(scenarioKeys)('%s: 액션 버튼은 콜·레이즈·체크·폴드 순서로 4개다', (key) => {
    expect(tableFixtures[key].actions.map((action) => action.id)).toEqual(['call', 'raise', 'check', 'fold'])
  })

  it.each(scenarioKeys)('%s: 비활성 버튼에는 이유 문구가 있다', (key) => {
    for (const action of tableFixtures[key].actions.filter((item) => !item.enabled)) {
      expect(action.detail.trim()).not.toBe('')
    }
  })

  it.each(scenarioKeys)('%s: 차례는 한 명에게만 있다', (key) => {
    const snapshot = tableFixtures[key]
    const heroTurn = snapshot.actions.some((action) => action.enabled) || snapshot.recordingState === 'processing'
    const opponentTurns = snapshot.seats.filter((seat) => seat.isTurn).length
    expect(opponentTurns + (heroTurn ? 1 : 0)).toBeLessThanOrEqual(1)
  })

  it('내 차례가 아닐 때는 기록 상태를 렌더링하지 않는다', () => {
    expect(tableFixtures.opp.recordingState).toBe('hidden')
    expect(tableFixtures.fold.recordingState).toBe('hidden')
    expect(tableFixtures.allin.recordingState).toBe('hidden')
    expect(tableFixtures.showdown.recordingState).toBe('hidden')
    expect(tableFixtures.disc.recordingState).toBe('hidden')
    expect(tableFixtures.my.recordingState).toBe('recording')
    expect(tableFixtures.pending.recordingState).toBe('processing')
    expect(tableFixtures.micfail.recordingState).toBe('failed')
  })

  it('마이크 실패여도 액션은 정상 활성이다', () => {
    const enabled = tableFixtures.micfail.actions.filter((action) => action.enabled).map((action) => action.id)
    expect(enabled).toEqual(['call', 'raise', 'fold'])
  })

  it.each(['my', 'micfail'] as const)('%s: 기본 레이즈 금액이 허용 범위 안이다', (key) => {
    const snapshot = tableFixtures[key]
    expect(snapshot.selectedBetAmount).toBeGreaterThanOrEqual(snapshot.minRaise)
    expect(snapshot.selectedBetAmount).toBeLessThanOrEqual(snapshot.maxRaise)
    expect(snapshot.selectedBetAmount % 50).toBe(0)
  })

  it('올인 시나리오는 메인·사이드 팟과 참여 범위 문구가 있다', () => {
    const snapshot = tableFixtures.allin
    expect(snapshot.pots.map((pot) => pot.label)).toEqual(['메인 팟', '사이드 팟'])
    expect(snapshot.potNote).toBe('서준은 메인 팟까지만 참여')
    expect(snapshot.seats.find((seat) => seat.id === 'seojun')).toMatchObject({ stack: 0, status: 'all-in' })
  })

  it('보드 카드 수가 스트리트와 맞는다', () => {
    const count = (key: keyof typeof tableFixtures) => tableFixtures[key].board.filter(Boolean).length
    expect(count('opp')).toBe(3)
    expect(count('allin')).toBe(4)
    expect(count('showdown')).toBe(5)
  })

  it('getTableSnapshot은 원본을 건드리지 않는 복사본을 돌려준다', () => {
    const snapshot = getTableSnapshot('showdown')
    snapshot.seats[0].name = '바뀜'
    snapshot.board[0]!.rank = '2'
    snapshot.logs.push('추가')
    snapshot.seats[1].showdownCards![0].rank = '2'

    expect(tableFixtures.showdown.seats[0].name).toBe('유진')
    expect(tableFixtures.showdown.board[0]?.rank).toBe('K')
    expect(tableFixtures.showdown.logs).not.toContain('추가')
    expect(tableFixtures.showdown.seats[1].showdownCards?.[0].rank).toBe('7')
  })
})
