/**
 * 인원(2~6) × 스택 구간마다 프리플랍 차트를 풀어 화면이 읽는 JSON으로 저장한다.
 *
 *   pnpm --filter @banwonpoker/gto charts [반복 횟수, 기본 3000] [인원 스택 …로 일부만]
 *   예) pnpm --filter @banwonpoker/gto charts 3000 6 100
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { solveChart } from '../src/build'
import { compatibilityMatrix } from '../src/cards'
import { CHART_PLAYERS, CHART_STACKS, chartFileName } from '../src/chart'
import type { ChartFile } from '../src/chart'
import { decodeEquity } from '../src/tables'

interface Job {
  players: number
  stack: number
  iterations: number
}

const outputDir = fileURLToPath(new URL('../../../frontend/src/features/gto/charts/', import.meta.url))

if (!isMainThread) {
  const equity = decodeEquity(JSON.parse(readFileSync(new URL('../tables/equity.json', import.meta.url), 'utf8')))
  const compat = compatibilityMatrix()
  parentPort?.on('message', (job: Job | null) => {
    if (!job) {
      parentPort?.close()
      return
    }
    parentPort?.postMessage(solveChart(job.players, job.stack, job.iterations, equity, compat))
  })
} else {
  const iterations = Number(process.argv[2] ?? 3000)
  const only = process.argv.slice(3).map(Number)
  const jobs: Job[] = []
  for (const players of CHART_PLAYERS) {
    for (const stack of CHART_STACKS) {
      if (only.length === 2 && (only[0] !== players || only[1] !== stack)) continue
      jobs.push({ players, stack, iterations })
    }
  }
  // 오래 걸리는 큰 트리부터 맡긴다.
  jobs.sort((a, b) => b.players - a.players || b.stack - a.stack)
  mkdirSync(outputDir, { recursive: true })

  const started = Date.now()
  const total = jobs.length
  let finished = 0
  const threads = Math.min(total, Math.max(1, availableParallelism() - 1))
  await Promise.all(
    Array.from(
      { length: threads },
      () =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(fileURLToPath(import.meta.url), { execArgv: ['--import', 'tsx'] })
          const next = () => worker.postMessage(jobs.shift() ?? null)
          worker.on('message', (chart: ChartFile) => {
            writeFileSync(`${outputDir}${chartFileName(chart.players, chart.stack)}`, JSON.stringify(chart) + '\n')
            finished += 1
            const seconds = Math.round((Date.now() - started) / 1000)
            console.log(
              `${finished}/${total} ${chart.players}인 ${chart.stack}BB · 노드 ${chart.nodes.length} · NashConv ${chart.nashConv} · ${seconds}초`,
            )
            next()
          })
          worker.on('error', reject)
          worker.on('exit', () => resolve())
          next()
        }),
    ),
  )
  console.log(`저장: ${outputDir}`)
}
