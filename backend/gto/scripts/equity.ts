/**
 * 169×169 프리플랍 올인 승률표를 만든다. 한 번만 돌리면 되고 결과는 tables/equity.json에 커밋한다.
 *
 *   pnpm --filter @banwonpoker/gto equity [핸드쌍마다 표본 수, 기본 20000]
 */
import { writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { HAND_COUNT } from '../src/cards'
import { equityRows } from '../src/equity'
import { EQUITY_SCALE } from '../src/tables'

const SEED = 20261005

interface Job {
  from: number
  to: number
  samples: number
}

if (!isMainThread) {
  const { from, to, samples } = workerData as Job
  parentPort?.postMessage(equityRows(from, to, samples, SEED))
} else {
  const samples = Number(process.argv[2] ?? 20000)
  const threads = Math.max(1, availableParallelism() - 1)
  // 앞쪽 줄일수록 계산할 칸(o >= h)이 많으므로 작은 덩어리로 나눠 차례로 맡긴다.
  const jobs: Job[] = []
  for (let from = 0; from < HAND_COUNT; from += 4) jobs.push({ from, to: Math.min(HAND_COUNT, from + 4), samples })

  const matrix = new Float64Array(HAND_COUNT * HAND_COUNT)
  const started = Date.now()
  let finished = 0
  const runNext = async (): Promise<void> => {
    const job = jobs.shift()
    if (!job) return
    const rows = await new Promise<Float64Array>((resolve, reject) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: job, execArgv: ['--import', 'tsx'] })
      worker.once('message', resolve)
      worker.once('error', reject)
    })
    for (let h = job.from; h < job.to; h += 1) {
      for (let o = h; o < HAND_COUNT; o += 1) {
        const equity = rows[(h - job.from) * HAND_COUNT + o]
        matrix[h * HAND_COUNT + o] = equity
        matrix[o * HAND_COUNT + h] = 1 - equity
      }
    }
    finished += 1
    process.stdout.write(`\r${finished}/${Math.ceil(HAND_COUNT / 4)} 묶음 · ${Math.round((Date.now() - started) / 1000)}초`)
    return runNext()
  }
  await Promise.all(Array.from({ length: threads }, runNext))

  const values = Array.from(matrix, (equity) => Math.round(equity * EQUITY_SCALE))
  const path = fileURLToPath(new URL('../tables/equity.json', import.meta.url))
  writeFileSync(path, JSON.stringify({ samples, seed: SEED, scale: EQUITY_SCALE, values }) + '\n')
  console.log(`\n저장: ${path}`)
}
