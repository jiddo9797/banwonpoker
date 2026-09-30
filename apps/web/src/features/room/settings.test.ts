import { describe, expect, it } from 'vitest'
import {
  blindSummary,
  defaultRoomSettings,
  generateLevels,
  hasErrors,
  level,
  nextLevelNote,
  validateRoomSettings,
} from './settings'
import type { RoomSettings } from './settings'

const increasing: RoomSettings = { ...defaultRoomSettings, blindMode: 'increasing', levels: generateLevels(50) }

describe('generateLevels', () => {
  it('첫 블라인드부터 1.5배쯤씩 오르고, 빅 블라인드는 항상 두 배다', () => {
    const levels = generateLevels(50)
    expect(levels.map((item) => item.smallBlind)).toEqual([50, 100, 150, 250, 400, 600, 900, 1350])
    for (const item of levels) expect(item.bigBlind).toBe(item.smallBlind * 2)
  })

  it('레벨은 항상 앞 레벨보다 크다', () => {
    for (const first of [25, 50, 100, 200, 5]) {
      const levels = generateLevels(first, 12)
      levels.slice(1).forEach((item, index) => expect(item.smallBlind).toBeGreaterThan(levels[index].smallBlind))
    }
  })
})

describe('validateRoomSettings', () => {
  it('기본 설정은 올바르다', () => {
    expect(validateRoomSettings(defaultRoomSettings)).toEqual({})
    expect(validateRoomSettings(increasing)).toEqual({})
  })

  it('방 이름은 비울 수 없고 20자를 넘을 수 없다', () => {
    expect(validateRoomSettings({ ...defaultRoomSettings, name: '  ' }).name).toBe('방 이름을 입력하세요.')
    expect(validateRoomSettings({ ...defaultRoomSettings, name: '가'.repeat(21) }).name).toBe(
      '방 이름은 20자 이하로 입력하세요.',
    )
  })

  it('시작 칩은 첫 빅 블라인드의 20배 이상, 100만 이하다', () => {
    expect(validateRoomSettings({ ...defaultRoomSettings, startingStack: 1_999 }).startingStack).toMatch(/2,000/)
    expect(validateRoomSettings({ ...defaultRoomSettings, startingStack: 2_000 }).startingStack).toBeUndefined()
    expect(validateRoomSettings({ ...defaultRoomSettings, startingStack: 1_000_001 }).startingStack).toMatch(
      /1,000,000 이하/,
    )
    expect(validateRoomSettings({ ...defaultRoomSettings, startingStack: Number.NaN }).startingStack).toBeDefined()
  })

  it('스몰 블라인드는 1 이상의 정수다', () => {
    expect(validateRoomSettings({ ...defaultRoomSettings, levels: [level(0)] }).levels).toBeDefined()
    expect(validateRoomSettings({ ...defaultRoomSettings, levels: [level(12.5)] }).levels).toBeDefined()
  })

  it('고정이면 첫 레벨만 본다', () => {
    const settings = { ...defaultRoomSettings, levels: [level(50), level(10)] }
    expect(validateRoomSettings(settings).levels).toBeUndefined()
  })

  it('인상하려면 레벨이 두 개 이상이고 계속 커져야 한다', () => {
    expect(validateRoomSettings({ ...increasing, levels: [level(50)] }).levels).toMatch(/2개 이상/)
    expect(validateRoomSettings({ ...increasing, levels: [level(50), level(100), level(100)] }).levels).toBe(
      '레벨 3은 레벨 2보다 커야 합니다.',
    )
    expect(validateRoomSettings({ ...increasing, levels: [level(50), level(Number.NaN)] }).levels).toMatch(/모든 레벨/)
  })

  it('hasErrors는 오류가 하나라도 있으면 참이다', () => {
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ name: 'x' })).toBe(true)
  })
})

describe('규칙 요약 문구', () => {
  it('고정과 인상을 구분해 요약한다', () => {
    expect(blindSummary(defaultRoomSettings)).toBe('50 / 100 고정')
    expect(blindSummary(increasing)).toBe('50 / 100부터 15분마다 인상 · 8레벨')
  })

  it('인상 방식이면 테이블에 다음 레벨을 안내한다', () => {
    expect(nextLevelNote(defaultRoomSettings)).toBeUndefined()
    expect(nextLevelNote(increasing, 12)).toBe('레벨 1 · 12분 뒤 100 / 200')
  })
})
