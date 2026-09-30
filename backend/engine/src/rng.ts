/** 0 이상 1 미만의 수를 돌려주는 난수 함수 */
export type Rng = () => number

/**
 * 시드로 재현 가능한 난수(mulberry32). 테스트와 복기 재현용이다.
 * 실제 게임에서는 예측할 수 없도록 {@link cryptoRng}를 쓴다.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** 암호학적으로 안전한 난수. Node 22와 브라우저의 Web Crypto를 쓴다. */
export function cryptoRng(): Rng {
  const buffer = new Uint32Array(1)
  return () => {
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0] / 4_294_967_296
  }
}

/** Fisher–Yates 셔플. 원본 배열은 건드리지 않는다. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}
