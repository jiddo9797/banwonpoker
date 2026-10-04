import { HAND_COUNT } from './cards'

/** 승률표 파일은 승률에 이 값을 곱한 정수로 저장한다. */
export const EQUITY_SCALE = 10000

export interface EquityFile {
  samples: number
  seed: number
  scale: number
  /** 169×169, `values[h * 169 + o]` = h의 o 상대 승률 × scale */
  values: number[]
}

export function decodeEquity(file: EquityFile): Float64Array {
  if (file.values.length !== HAND_COUNT * HAND_COUNT) throw new Error('승률표 크기가 맞지 않습니다.')
  return Float64Array.from(file.values, (value) => value / file.scale)
}
