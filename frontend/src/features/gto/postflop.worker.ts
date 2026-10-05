/// <reference lib="webworker" />
/**
 * 포스트플랍 솔버(WASM)를 돌리는 워커. 한 번에 한 핸드만 들고 있고,
 * 같은 핸드의 다른 결정은 다시 풀지 않고 바로 답한다.
 */
import type { WasmSpot } from './postflop-wasm/postflop.js'
import type { WorkerRequest, WorkerResponse } from './postflopClient'

declare const self: DedicatedWorkerGlobalScope

/** 한 묶음을 이 시간쯤 돌리고 진행을 알린다. */
const BATCH_MS = 1000
/**
 * 균형 오차 계산은 반복 한두 번만큼 비싸므로, 잰 시간의 약 10배 간격으로만 한다.
 * 작은 상황은 자주 재서 다 풀리면 바로 멈추고, 큰 상황은 드물게 잰다.
 */
const CHECK_RATIO = 10
const CHECK_MIN_MS = 1500
const CHECK_MAX_MS = 8000

type Solver = { WasmSpot: typeof WasmSpot; threads: number; fallback?: string }

/**
 * 교차 출처 격리(COOP/COEP)가 되어 SharedArrayBuffer를 쓸 수 있으면 멀티스레드 빌드를,
 * 아니면 스레드 하나짜리 빌드를 불러온다.
 */
async function loadSolver(): Promise<Solver> {
  let fallback = '교차 출처 격리가 안 되어 있습니다.'
  if (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
    try {
      const threaded = await import('./postflop-wasm-mt/postflop.js')
      await threaded.default()
      const threads = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4))
      // 워커 안에서 워커를 못 띄우는 브라우저(일부 내장 브라우저 등)에서는 스레드 풀이 뜨지 않는다. 기다리지 않고 스레드 하나로 넘어간다.
      await Promise.race([
        threaded.initThreadPool(threads),
        new Promise((_, reject) => setTimeout(() => reject(new Error('스레드 풀이 시간 안에 뜨지 않았습니다.')), 8_000)),
      ])
      return { WasmSpot: threaded.WasmSpot, threads }
    } catch (error) {
      fallback = error instanceof Error ? error.message : String(error)
      console.warn('멀티스레드 솔버를 열지 못해 스레드 하나로 풉니다.', error)
    }
  }
  const single = await import('./postflop-wasm/postflop.js')
  await single.default()
  return { WasmSpot: single.WasmSpot, threads: 1, fallback }
}

let ready: Promise<Solver> | null = null
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
    ready ??= loadSolver()
    const solver = await ready
    if (message.type === 'solve') {
      const mine = ++generation
      if (current?.key !== message.key) {
        current?.spot.free()
        current = { key: message.key, spot: new solver.WasmSpot(JSON.stringify(message.config)), done: false, exploitability: Number.POSITIVE_INFINITY }
      }
      const spot = current
      if (!spot.done) {
        const pot = spot.spot.starting_pot()
        const started = performance.now()
        let lastCheck = started
        let perIteration = 0
        let checkEvery = CHECK_MIN_MS
        while (true) {
          const count = perIteration > 0 ? Math.min(50, Math.max(1, Math.round(BATCH_MS / perIteration))) : 1
          const batchStart = performance.now()
          spot.spot.run(count)
          const now = performance.now()
          perIteration = (now - batchStart) / count
          const elapsed = now - started
          const overBudget = elapsed >= message.budgetMs && spot.spot.iterations() >= message.minIterations
          const lastRound = overBudget || spot.spot.iterations() >= message.maxIterations
          if (now - lastCheck >= checkEvery || lastRound || !Number.isFinite(spot.exploitability)) {
            const checkStart = performance.now()
            spot.exploitability = spot.spot.exploitability() / pot
            lastCheck = performance.now()
            checkEvery = Math.min(CHECK_MAX_MS, Math.max(CHECK_MIN_MS, (lastCheck - checkStart) * CHECK_RATIO))
          }
          post({
            type: 'progress',
            id: message.id,
            iterations: spot.spot.iterations(),
            exploitability: spot.exploitability,
            elapsedMs: elapsed,
            budgetMs: message.budgetMs,
            threads: solver.threads,
            fallback: solver.fallback,
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

