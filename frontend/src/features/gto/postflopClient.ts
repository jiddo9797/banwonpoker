import type { PathStep, SolverInput } from './postflop'

/** 솔버가 돌려주는 결정 지점의 전략(backend/postflop의 Report) */
export interface PostflopReport {
  /** 0: OOP, 1: IP */
  player: number
  actions: Array<{ kind: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'; amount: number }>
  strategy: number[]
  /** 행동별 EV(칩) */
  evs: number[]
  equity: number
  weight: number
  rangeStrategy: number[]
  pot: number
  board: string[]
  mappings: Array<{ real: { kind: string; amount: number }; chosen: { kind: string; amount: number } }>
}

export type WorkerRequest =
  | {
      type: 'solve'
      id: number
      key: string
      config: SolverInput['config']
      targetFraction: number
      budgetMs: number
      minIterations: number
      maxIterations: number
    }
  | { type: 'report'; id: number; key: string; request: { path: PathStep[]; hand: string } }
  | { type: 'cancel'; id: number }

export type WorkerResponse =
  | { type: 'progress'; id: number; iterations: number; exploitability: number; elapsedMs: number; budgetMs: number; threads: number; fallback?: string }
  | { type: 'solved'; id: number; iterations: number; exploitability: number }
  | { type: 'cancelled'; id: number }
  | { type: 'report'; id: number; report: PostflopReport }
  | { type: 'error'; id: number; message: string }

export interface SolveProgress {
  iterations: number
  /** 균형 오차(팟 대비). 아직 재지 않았으면 Infinity */
  exploitability: number
  elapsedMs: number
  budgetMs: number
  /** 솔버가 쓰는 스레드 수 */
  threads: number
  /** 멀티스레드를 못 쓴 이유 */
  fallback?: string
}

export interface SolveResult {
  iterations: number
  exploitability: number
}

/** 화면에서 쓰는 솔버. 테스트에서는 가짜로 바꿔 끼운다. */
export interface PostflopSolver {
  solve(key: string, config: SolverInput['config'], onProgress: (progress: SolveProgress) => void, signal: AbortSignal): Promise<SolveResult>
  report(key: string, path: PathStep[], hand: string): Promise<PostflopReport>
}

/**
 * 팟의 1%까지 풀거나 2분이 지나면 멈춘다. 브라우저 스레드 하나로는 넓은 레인지(림프 팟 등)가
 * 1%까지 가는 데 몇 분 걸리므로, 시간이 다 되면 그때의 오차를 함께 보여준다.
 */
export const TARGET_EXPLOITABILITY = 0.01
export const BUDGET_MS = 120_000
export const MIN_ITERATIONS = 20
export const MAX_ITERATIONS = 1000

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (value: WorkerResponse) => void; onProgress?: (progress: SolveProgress) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./postflop.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    const waiting = pending.get(message.id)
    if (!waiting) return
    if (message.type === 'progress') {
      waiting.onProgress?.({
        iterations: message.iterations,
        exploitability: message.exploitability,
        elapsedMs: message.elapsedMs,
        budgetMs: message.budgetMs,
        threads: message.threads,
        fallback: message.fallback,
      })
      return
    }
    pending.delete(message.id)
    waiting.resolve(message)
  }
  worker.onerror = (event) => {
    // WASM이 메모리 부족 등으로 멈추면 워커를 새로 만든다.
    for (const [id, waiting] of pending) waiting.resolve({ type: 'error', id, message: event.message || '솔버가 멈췄습니다. 메모리가 부족할 수 있습니다.' })
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function send(request: WorkerRequest, onProgress?: (progress: SolveProgress) => void): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    pending.set(request.id, { resolve, onProgress })
    getWorker().postMessage(request)
  })
}

export const browserSolver: PostflopSolver = {
  async solve(key, config, onProgress, signal) {
    const id = nextId++
    const abort = () => getWorker().postMessage({ type: 'cancel', id } satisfies WorkerRequest)
    signal.addEventListener('abort', abort, { once: true })
    try {
      const result = await send(
        {
          type: 'solve',
          id,
          key,
          config,
          targetFraction: TARGET_EXPLOITABILITY,
          budgetMs: BUDGET_MS,
          minIterations: MIN_ITERATIONS,
          maxIterations: MAX_ITERATIONS,
        },
        onProgress,
      )
      if (result.type === 'error') throw new Error(result.message)
      if (result.type === 'cancelled') throw new DOMException('취소했습니다.', 'AbortError')
      if (result.type !== 'solved') throw new Error('솔버 응답이 올바르지 않습니다.')
      return { iterations: result.iterations, exploitability: result.exploitability }
    } finally {
      signal.removeEventListener('abort', abort)
    }
  },
  async report(key, path, hand) {
    const result = await send({ type: 'report', id: nextId++, key, request: { path, hand } })
    if (result.type === 'error') throw new Error(result.message)
    if (result.type !== 'report') throw new Error('솔버 응답이 올바르지 않습니다.')
    return result.report
  },
}
