import { describe, expect, it } from 'vitest'
import { parseCards } from './cards'
import { compareHands, evaluateBest, evaluateFive, handName } from './evaluator'

const five = (codes: string) => evaluateFive(parseCards(codes))
const best = (codes: string) => evaluateBest(parseCards(codes))

describe('evaluateFive', () => {
  it.each([
    ['As Ks Qs Js Ts', 'straight-flush'],
    ['9c 9d 9h 9s 2d', 'four-of-a-kind'],
    ['Kc Kd Kh 4s 4d', 'full-house'],
    ['Ah Jh 8h 4h 2h', 'flush'],
    ['9c 8d 7h 6s 5d', 'straight'],
    ['Ac 2d 3h 4s 5d', 'straight'],
    ['7c 7d 7h Ks 2d', 'three-of-a-kind'],
    ['Kc Kd 9h 9s 2d', 'two-pair'],
    ['7c 7d Ah Ks 2d', 'one-pair'],
    ['Ac Jd 8h 4s 2d', 'high-card'],
  ])('%s → %s', (codes, category) => {
    expect(five(codes).category).toBe(category)
  })

  it('다섯 장이 아니면 거부한다', () => {
    expect(() => evaluateFive(parseCards('As Ks Qs Js'))).toThrow()
  })
})

describe('compareHands', () => {
  it('족보 순서대로 이긴다', () => {
    const order = [
      'Ac Jd 8h 4s 2d',
      '7c 7d Ah Ks 2d',
      'Kc Kd 9h 9s 2d',
      '7c 7d 7h Ks 2d',
      '9c 8d 7h 6s 5d',
      'Ah Jh 8h 4h 2h',
      'Kc Kd Kh 4s 4d',
      '9c 9d 9h 9s 2d',
      '9s 8s 7s 6s 5s',
    ].map(five)
    for (let index = 1; index < order.length; index += 1) {
      expect(compareHands(order[index], order[index - 1])).toBeGreaterThan(0)
    }
  })

  it('A-2-3-4-5 스트레이트(휠)는 5가 가장 높은 스트레이트다', () => {
    const wheel = five('Ac 2d 3h 4s 5d')
    expect(wheel.tiebreak).toEqual([5])
    expect(compareHands(five('2c 3d 4h 5s 6d'), wheel)).toBeGreaterThan(0)
    expect(compareHands(five('Tc Jd Qh Ks Ad'), wheel)).toBeGreaterThan(0)
  })

  it('같은 족보는 높은 카드와 키커로 가린다', () => {
    expect(compareHands(five('Ac Ad Kh 4s 2d'), five('Ac Ad Qh Js Td'))).toBeGreaterThan(0)
    expect(compareHands(five('Kc Kd 9h 9s Ad'), five('Kh Ks 9c 9d Qd'))).toBeGreaterThan(0)
    expect(compareHands(five('Kc Kd 9h 9s 2d'), five('Qc Qd Jh Js Ad'))).toBeGreaterThan(0)
    expect(compareHands(five('Kc Kd Kh 2s 2d'), five('Qc Qd Qh As Ad'))).toBeGreaterThan(0)
    expect(compareHands(five('Ah Jh 8h 4h 3h'), five('Ad Jd 8d 4d 2d'))).toBeGreaterThan(0)
  })

  it('무늬만 다른 같은 족보는 비긴다', () => {
    expect(compareHands(five('Ac Kd 9h 7s 3d'), five('Ad Kc 9s 7h 3c'))).toBe(0)
  })
})

describe('evaluateBest', () => {
  it('일곱 장에서 가장 좋은 다섯 장을 고른다', () => {
    const value = best('Ah Kh Ks 9h 4h 2c Jh')
    expect(value.category).toBe('flush')
    expect(value.tiebreak).toEqual([14, 13, 11, 9, 4])
  })

  it('보드만으로 스트레이트가 되면 보드를 쓴다', () => {
    expect(best('2c 3d 9h Th Js Qd Kc').tiebreak).toEqual([13])
  })

  it('여섯 장, 다섯 장도 된다', () => {
    expect(best('7c 7d 7h 7s 2d 3c').category).toBe('four-of-a-kind')
    expect(best('7c 7d 7h 7s 2d').category).toBe('four-of-a-kind')
  })

  it('다섯 장보다 적거나 일곱 장보다 많으면 거부한다', () => {
    expect(() => best('As Ks')).toThrow()
    expect(() => best('As Ks Qs Js Ts 9s 8s 7s')).toThrow()
  })
})

describe('handName', () => {
  it.each([
    ['7c 7d Ks 9h 4h 2c Jh', '세븐 원 페어'],
    ['Kd 9d Ks 9h 4h 2c Jh', '킹·나인 투 페어'],
    ['Ah Kh Ks 9h 4h 2c Jh', '에이스 하이 플러시'],
    ['Ac 2d 3h 4s 5d', '파이브 하이 스트레이트'],
    ['Qh Qs Qd 8c 3s 7h 2d', '퀸 트리플'],
    ['Kc Kd Kh 4s 4d', '킹 풀 하우스'],
    ['9c 9d 9h 9s 2d', '나인 포카드'],
    ['As Ks Qs Js Ts', '로열 플러시'],
    ['9s 8s 7s 6s 5s', '나인 하이 스트레이트 플러시'],
    ['Ac Jd 8h 4s 2d', '에이스 하이'],
  ])('%s → %s', (codes, name) => {
    expect(handName(best(codes))).toBe(name)
  })
})
