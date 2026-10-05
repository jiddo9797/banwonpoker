/// <reference lib="webworker" />
/** 멀티웨이 참고 분석의 승률 계산 워커. 솔버 워커와 따로 돌아 솔버가 풀고 있어도 기다리지 않는다. */
import { computeEquity } from './equity'
import type { EquityRequest } from './equity'
import type { EquityWorkerResponse } from './equityClient'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<{ id: number; request: EquityRequest }>) => {
  const { id, request } = event.data
  try {
    self.postMessage({ id, result: computeEquity(request) } satisfies EquityWorkerResponse)
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies EquityWorkerResponse)
  }
}
