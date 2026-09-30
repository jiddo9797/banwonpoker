/** 현재 시각과 타이머. 테스트에서는 가짜 시계로 바꿔 60초 타이머를 즉시 검증한다. */
export interface Clock {
  now(): number
  setTimeout(callback: () => void, ms: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

export type TimerHandle = { readonly id: number } | ReturnType<typeof setTimeout>

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms)
    // 타이머 때문에 프로세스가 끝나지 못하는 일이 없게 한다.
    if (typeof handle === 'object' && 'unref' in handle) handle.unref()
    return handle
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** 테스트용 가짜 시계. advance로 시간을 흘려 예약된 콜백을 순서대로 실행한다. */
export class FakeClock implements Clock {
  private time: number
  private nextId = 1
  private timers = new Map<number, { at: number; callback: () => void }>()

  constructor(start = 1_800_000_000_000) {
    this.time = start
  }

  now() {
    return this.time
  }

  setTimeout(callback: () => void, ms: number) {
    const id = this.nextId++
    this.timers.set(id, { at: this.time + Math.max(0, ms), callback })
    return { id }
  }

  clearTimeout(handle: TimerHandle) {
    if (typeof handle === 'object' && 'id' in handle) this.timers.delete(handle.id as number)
  }

  /** 시간을 ms만큼 흘린다. 그 사이 새로 예약된 타이머도 때가 되면 실행한다. */
  advance(ms: number) {
    const end = this.time + ms
    for (;;) {
      const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      const [id, timer] = due
      this.timers.delete(id)
      this.time = timer.at
      timer.callback()
    }
    this.time = end
  }

  get pending() {
    return this.timers.size
  }
}
