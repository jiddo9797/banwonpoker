/// <reference lib="webworker" />
/**
 * 포스트플랍 솔버(WASM)를 돌리는 워커. 한 번에 한 핸드만 들고 있고,
 * 같은 핸드의 다른 결정은 다시 풀지 않고 바로 답한다.
 */
import init, { WasmSpot } from './postflop-wasm/postflop.js'
import type { WorkerRequest, WorkerResponse } from './postflopClient'

declare const self: DedicatedWorkerGlobalScope

/** 한 묶음을 이 시간쯤 돌리고 진행을 알린다. */
const BATCH_MS = 1000
/** 균형 오차 계산은 반복 한두 번만큼 비싸므로 이 간격으로만 한다. */
const CHECK_MS = 8000

let ready: Promise<unknown> | null = null
let current: { key: string; spot: WasmSpot; done: boolean; exploitability: number } | null = null
// 새 풀이나 취소가 오면 숫자가 바뀌고, 돌던 반복은 그걸 보고 멈춘다.
let generation = 0

const post = (message: WorkerResponse) => self.postMessage(message)
const pause = () => new Promise((resolve) => setTimeout(resolve, 0))

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    generation += 1
    return
  }
  try {
    ready ??= init()
    await ready
    if (message.type === 'solve') {
      const mine = ++generation
      if (current?.key !== message.key) {
        current?.spot.free()
        current = { key: message.key, spot: new WasmSpot(JSON.stringify(message.config)), done: false, exploitability: Number.POSITIVE_INFINITY }
      }
      const spot = current
      if (!spot.done) {
        const pot = spot.spot.starting_pot()
        const started = performance.now()
        let lastCheck = started
        let perIteration = 0
        while (true) {
          const count = perIteration > 0 ? Math.min(50, Math.max(1, Math.round(BATCH_MS / perIteration))) : 1
          const batchStart = performance.now()
          spot.spot.run(count)
          const now = performance.now()
          perIteration = (now - batchStart) / count
          const elapsed = now - started
          const overBudget = elapsed >= message.budgetMs && spot.spot.iterations() >= message.minIterations
          const lastRound = overBudget || spot.spot.iterations() >= message.maxIterations
          if (now - lastCheck >= CHECK_MS || lastRound || !Number.isFinite(spot.exploitability)) {
            spot.exploitability = spot.spot.exploitability() / pot
            lastCheck = performance.now()
          }
          post({
            type: 'progress',
            id: message.id,
            iterations: spot.spot.iterations(),
            exploitability: spot.exploitability,
            elapsedMs: elapsed,
            budgetMs: message.budgetMs,
          })
          if (spot.exploitability <= message.targetFraction || lastRound) break
          // 취소 메시지를 받을 틈을 준다.
          await pause()
          if (mine !== generation) {
            post({ type: 'cancelled', id: message.id })
            return
          }
        }
        spot.done = true
      }
      post({ type: 'solved', id: message.id, iterations: spot.spot.iterations(), exploitability: spot.exploitability })
      return
    }
    if (message.type === 'report') {
      if (!current || current.key !== message.key || !current.done) throw new Error('먼저 이 핸드를 풀어야 합니다.')
      post({ type: 'report', id: message.id, report: JSON.parse(current.spot.report(JSON.stringify(message.request))) })
    }
  } catch (error) {
    post({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) })
  }
}

