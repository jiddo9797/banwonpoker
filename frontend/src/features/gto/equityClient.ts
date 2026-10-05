import type { EquityRequest, EquityResult } from './equity'

export type EquityWorkerResponse = { id: number; result: EquityResult } | { id: number; error: string }

/** 화면에서 쓰는 승률 계산기. 테스트에서는 computeEquity를 바로 부르는 것으로 바꿔 끼운다. */
export interface EquityCalculator {
  compute(request: EquityRequest): Promise<EquityResult>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (result: EquityResult) => void; reject: (error: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<EquityWorkerResponse>) => {
    const message = event.data
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    if ('error' in message) waiting.reject(new Error(message.error))
    else waiting.resolve(message.result)
  }
  worker.onerror = (event) => {
    for (const waiting of pending.values()) waiting.reject(new Error(event.message || '승률 계산이 멈췄습니다.'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export const browserEquity: EquityCalculator = {
  compute(request) {
    return new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ id, request })
    })
  },
}
