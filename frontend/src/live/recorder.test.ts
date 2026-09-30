import type { TurnReport } from '@banwonpoker/server/protocol'
import { describe, expect, it } from 'vitest'
import { CHUNK_MS, TurnRecorder } from './recorder'
import type { RecorderStatus } from './recorder'

class FakeTrack {
  stopped = false
  stop() {
    this.stopped = true
  }
}

class FakeStream {
  tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
}

class FakeRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  timeslice = 0
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onstart: (() => void) | null = null

  start(timeslice: number) {
    this.timeslice = timeslice
    this.state = 'recording'
    this.onstart?.()
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: 'audio/webm' }) } as BlobEvent)
  }
  pause() {
    this.state = 'paused'
  }
  resume() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.emit('last')
    this.onstop?.()
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(options: { deny?: boolean; peak?: number; failUploads?: number; slowMic?: boolean } = {}) {
  let now = 10_000
  const uploads: Array<[number, number, string]> = []
  const reports: Array<[number, TurnReport]> = []
  const statuses: Array<[RecorderStatus, boolean]> = []
  const streams: FakeStream[] = []
  const recorders: FakeRecorder[] = []
  const timers: Array<() => void> = []
  let failures = options.failUploads ?? 0
  let releaseMic: (() => void) | null = null

  const recorder = new TurnRecorder({
    sessionNow: () => now,
    sink: {
      uploadChunk: async (turnSeq, index, chunk) => {
        if (failures > 0) {
          failures -= 1
          throw new Error('network')
        }
        uploads.push([turnSeq, index, await chunk.text()])
      },
      completeTurn: async (turnSeq, report) => {
        reports.push([turnSeq, report])
      },
    },
    getUserMedia: async () => {
      if (options.deny) throw new DOMException('denied', 'NotAllowedError')
      if (options.slowMic) await new Promise<void>((resolve) => (releaseMic = resolve))
      const stream = new FakeStream()
      streams.push(stream)
      return stream as unknown as MediaStream
    },
    createRecorder: () => {
      const created = new FakeRecorder()
      recorders.push(created)
      return created as never
    },
    createLevelMeter: () => ({ peak: () => options.peak ?? 0.3, close: () => undefined }),
    setTimer: (callback) => timers.push(callback),
    onStatus: (status, detail) => statuses.push([status, detail.retrying]),
  })

  return {
    recorder,
    uploads,
    reports,
    statuses,
    streams,
    recorders,
    advance: (ms: number) => {
      now += ms
    },
    runTimers: () => timers.splice(0).forEach((callback) => callback()),
    releaseMic: () => releaseMic?.(),
  }
}

describe('TurnRecorder', () => {
  it('차례 동안 3초 조각으로 녹음해 순서대로 올리고, 끝나면 결과를 알리고 마이크를 끈다', async () => {
    const { recorder, uploads, reports, streams, recorders, advance } = setup()
    await recorder.start(42)
    expect(recorder.state).toBe('recording')
    expect(recorders[0].timeslice).toBe(CHUNK_MS)

    recorders[0].emit('a')
    advance(3_000)
    recorders[0].emit('b')
    advance(1_500)
    await recorder.stop()
    await flush()

    expect(uploads).toEqual([
      [42, 0, 'a'],
      [42, 1, 'b'],
      [42, 2, 'last'],
    ])
    expect(reports).toEqual([[42, { chunks: 3, durationMs: 4_500, silent: false, failed: false, audioStartMs: 10_000 }]])
    expect(streams[0].tracks[0].stopped).toBe(true)
    expect(recorder.state).toBe('idle')
  })

  it('일시정지한 시간은 녹음 길이에서 뺀다', async () => {
    const { recorder, reports, advance } = setup()
    await recorder.start(1)
    advance(2_000)
    recorder.pause()
    expect(recorder.state).toBe('paused')
    advance(5_000)
    recorder.resume()
    advance(1_000)
    await recorder.stop()
    await flush()
    expect(reports[0][1].durationMs).toBe(3_000)
  })

  it('소리가 기준보다 작았으면 무발언으로 알린다', async () => {
    const { recorder, reports } = setup({ peak: 0.005 })
    await recorder.start(1)
    await recorder.stop()
    await flush()
    expect(reports[0][1].silent).toBe(true)
  })

  it('마이크 권한이 없으면 실패로 표시하고, 게임은 막지 않은 채 기록 실패를 알린다', async () => {
    const { recorder, reports, statuses } = setup({ deny: true })
    await recorder.start(7)
    expect(recorder.state).toBe('failed')
    expect(statuses.at(-1)?.[0]).toBe('failed')
    await recorder.stop()
    await flush()
    expect(reports).toEqual([[7, { chunks: 0, durationMs: 0, silent: false, failed: true, audioStartMs: null }]])
  })

  it('업로드가 실패하면 다시 시도하고, 그동안 재시도 중으로 알린다', async () => {
    const { recorder, uploads, reports, statuses, recorders, runTimers } = setup({ failUploads: 2 })
    await recorder.start(3)
    recorders[0].emit('a')
    await flush()
    expect(statuses.some(([, retrying]) => retrying)).toBe(true)
    expect(uploads).toEqual([])

    runTimers()
    await flush()
    runTimers()
    await flush()
    expect(uploads).toEqual([[3, 0, 'a']])
    expect(statuses.at(-1)?.[1]).toBe(false)

    await recorder.stop()
    await flush()
    expect(reports[0][1].chunks).toBe(2)
  })

  it('마이크를 여는 사이 차례가 끝나면 바로 끄고 아무것도 녹음하지 않는다', async () => {
    const { recorder, recorders, streams, reports, releaseMic } = setup({ slowMic: true })
    const starting = recorder.start(9)
    await flush()
    const stopping = recorder.stop()
    releaseMic()
    await starting
    await stopping
    await flush()
    expect(recorders).toHaveLength(0)
    expect(streams[0].tracks[0].stopped).toBe(true)
    expect(reports[0][1]).toMatchObject({ chunks: 0 })
  })

  it('다른 차례가 시작되면 이전 차례를 먼저 끝낸다', async () => {
    const { recorder, reports } = setup()
    await recorder.start(1)
    await recorder.start(2)
    expect(recorder.activeTurn).toBe(2)
    await flush()
    expect(reports.map(([turnSeq]) => turnSeq)).toEqual([1])
  })
})
