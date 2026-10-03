import type { TurnReport } from '@banwonpoker/server/protocol'

/** 음성 조각 길이. 명세의 2~5초 범위 */
export const CHUNK_MS = 3_000
/** 이보다 조용하면(RMS) 말하지 않은 것으로 본다. 약 -34 dBFS */
export const SILENCE_RMS = 0.02
const RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000]

/** 다시 보내도 결과가 같은 오류(권한 없음·음성 없이 바뀐 차례 등). 408·429는 잠시 뒤 될 수 있으므로 다시 시도한다. */
function isPermanentError(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
}

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'failed'

/** 녹음 결과를 서버로 보내는 방법. 실패하면 던진다. */
export interface RecordingSink {
  uploadChunk: (turnSeq: number, index: number, chunk: Blob) => Promise<void>
  completeTurn: (turnSeq: number, report: TurnReport) => Promise<void>
}

type MediaRecorderLike = Pick<MediaRecorder, 'start' | 'stop' | 'pause' | 'resume' | 'state'> & {
  ondataavailable: ((event: BlobEvent) => void) | null
  onstop: (() => void) | null
  onerror: ((event: Event) => void) | null
  onstart: (() => void) | null
}

export interface RecorderDeps {
  sink: RecordingSink
  /** 서버 기준 현재 세션 시각(ms) */
  sessionNow: () => number
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createRecorder?: (stream: MediaStream) => MediaRecorderLike
  /** 소리 크기를 잰다. null이면 재지 않는다(무발언 판정 안 함). */
  createLevelMeter?: (stream: MediaStream) => { peak: () => number | undefined; close: () => void } | null
  setTimer?: (callback: () => void, ms: number) => unknown
  onStatus?: (status: RecorderStatus, detail: { uploading: number; retrying: boolean }) => void
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
}

/** 음량을 잴 작은 구간(48kHz에서 약 21ms). 짧은 소리도 한 구간 안에 들어가 묻히지 않는다. */
const LEVEL_BLOCK = 1024

/**
 * samples의 뒤쪽 recent개 샘플을 작은 구간으로 나눠, 가장 큰 구간의 RMS를 돌려준다.
 * 구간을 반씩 겹쳐서 소리가 구간 경계에 걸려도 놓치지 않는다.
 */
export function loudestBlockRms(samples: Float32Array, recent: number, block = LEVEL_BLOCK) {
  const from = Math.max(0, samples.length - Math.max(recent, block))
  let loudest = 0
  for (let start = from; start < samples.length; start += block / 2) {
    const end = Math.min(start + block, samples.length)
    let sum = 0
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index]
    loudest = Math.max(loudest, Math.sqrt(sum / (end - start)))
    if (end === samples.length) break
  }
  return loudest
}

function defaultLevelMeter(stream: MediaStream) {
  if (typeof AudioContext === 'undefined') return null
  const context = new AudioContext()
  // 클릭 없이 만든 AudioContext는 멈춘 채 시작할 수 있다(새로고침 직후, iOS). 멈춘 채면 소리가 0으로 읽힌다.
  void context.resume().catch(() => undefined)
  const analyser = context.createAnalyser()
  // 지난 약 0.68초(48kHz)를 담아 두고, 잴 때마다 지난번 이후의 소리를 빠짐없이 본다.
  // 예전처럼 0.1초마다 최근 21ms만 보면 시간의 80%를 듣지 못해 짧은 말("콜")을 무발언으로 잡을 수 있었다.
  analyser.fftSize = 32768
  context.createMediaStreamSource(stream).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  let peak = 0
  let measured = false
  let lastTime: number | null = null
  const timer = window.setInterval(() => {
    if (context.state !== 'running') return
    analyser.getFloatTimeDomainData(samples)
    // 오디오 시계로 지난번 이후 들어온 샘플 수를 센다. 타이머가 밀려도 버퍼 안이면 놓치지 않는다.
    const now = context.currentTime
    const recent = lastTime === null ? samples.length : Math.ceil((now - lastTime) * context.sampleRate) + LEVEL_BLOCK
    lastTime = now
    measured = true
    peak = Math.max(peak, loudestBlockRms(samples, recent))
  }, 100)
  return {
    // 한 번도 재지 못했으면 모른다(undefined). 말했는데 무발언으로 잡혀 복기에서 빠지는 것을 막는다.
    peak: () => (measured ? peak : undefined),
    close: () => {
      window.clearInterval(timer)
      void context.close()
    },
  }
}

/**
 * 서버에 순서대로, 실패하면 다시 시도하며 보낸다. 같은 조각을 여러 번 보내도 서버가 한 번만 저장한다.
 * 페이지를 닫으면 남은 것은 사라지고, 서버는 그 차례를 `누락`으로 본다.
 */
class UploadQueue {
  private tasks: Array<() => Promise<void>> = []
  private running = false
  retrying = false
  private readonly setTimer: (callback: () => void, ms: number) => unknown
  private readonly onChange: () => void

  constructor(setTimer: (callback: () => void, ms: number) => unknown, onChange: () => void) {
    this.setTimer = setTimer
    this.onChange = onChange
  }

  get size() {
    return this.tasks.length
  }

  push(task: () => Promise<void>) {
    this.tasks.push(task)
    this.onChange()
    void this.run()
  }

  private async run() {
    if (this.running) return
    this.running = true
    let attempt = 0
    while (this.tasks.length > 0) {
      try {
        await this.tasks[0]()
        this.tasks.shift()
        attempt = 0
        if (this.retrying) this.retrying = false
        this.onChange()
      } catch (error) {
        if (isPermanentError(error) || attempt >= RETRY_DELAYS.length) {
          // 계속 실패하면 이 조각은 포기한다. 서버는 빠진 조각을 누락으로 기록한다.
          this.tasks.shift()
          attempt = 0
          this.onChange()
          continue
        }
        this.retrying = true
        this.onChange()
        const delay = RETRY_DELAYS[attempt]
        attempt += 1
        await new Promise<void>((resolve) => this.setTimer(resolve, delay))
      }
    }
    this.running = false
  }
}

/**
 * 내 차례 녹음기. start로 켜고 stop으로 끝낸다. 차례마다 마이크를 새로 열고 끝나면 완전히 끈다.
 * 녹음은 내 브라우저에서만 일어나고, 게임 중에는 누구에게도 전달되지 않는다(서버도 게임 중에는 내주지 않는다).
 */
export class TurnRecorder {
  private readonly deps: Required<Omit<RecorderDeps, 'onStatus'>> & Pick<RecorderDeps, 'onStatus'>
  private readonly queue: UploadQueue
  private status: RecorderStatus = 'idle'
  private current: {
    turnSeq: number
    stream: MediaStream | null
    recorder: MediaRecorderLike | null
    meter: ReturnType<NonNullable<RecorderDeps['createLevelMeter']>> | null
    chunks: number
    startedAt: number | null
    recordedMs: number
    resumedAt: number | null
    failed: boolean
    stopping: boolean
    /** 음성 기록을 꺼서 버린 차례 */
    discarded: boolean
  } | null = null

  constructor(deps: RecorderDeps) {
    this.deps = {
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      createRecorder: (stream) => {
        const mimeType = pickMimeType()
        return new MediaRecorder(stream, mimeType ? { mimeType } : undefined) as unknown as MediaRecorderLike
      },
      createLevelMeter: defaultLevelMeter,
      setTimer: (callback, ms) => window.setTimeout(callback, ms),
      ...deps,
    }
    this.queue = new UploadQueue(this.deps.setTimer, () => this.emit())
  }

  get state() {
    return this.status
  }

  get activeTurn() {
    return this.current?.turnSeq ?? null
  }

  private emit() {
    this.deps.onStatus?.(this.status, { uploading: this.queue.size, retrying: this.queue.retrying })
  }

  private setStatus(status: RecorderStatus) {
    this.status = status
    this.emit()
  }

  /** 차례가 시작되면 부른다. 이미 같은 차례를 녹음 중이면 무시한다. */
  async start(turnSeq: number) {
    if (this.current?.turnSeq === turnSeq) return
    if (this.current) await this.stop()
    const current = {
      turnSeq,
      stream: null as MediaStream | null,
      recorder: null as MediaRecorderLike | null,
      meter: null as ReturnType<NonNullable<RecorderDeps['createLevelMeter']>> | null,
      chunks: 0,
      startedAt: null as number | null,
      recordedMs: 0,
      resumedAt: null as number | null,
      failed: false,
      stopping: false,
      discarded: false,
    }
    this.current = current
    this.setStatus('starting')

    try {
      const stream = await this.deps.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      // 마이크를 여는 사이 차례가 끝났으면 바로 끈다.
      if (this.current !== current || current.stopping) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      current.stream = stream
      current.meter = this.deps.createLevelMeter(stream)
      const recorder = this.deps.createRecorder(stream)
      current.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0 || current.discarded) return
        const index = current.chunks
        current.chunks += 1
        const chunk = event.data
        this.queue.push(() => this.deps.sink.uploadChunk(turnSeq, index, chunk))
      }
      recorder.onerror = () => {
        current.failed = true
        this.setStatus('failed')
      }
      recorder.onstart = () => {
        current.startedAt = this.deps.sessionNow()
        current.resumedAt = current.startedAt
      }
      recorder.start(CHUNK_MS)
      this.setStatus('recording')
    } catch {
      // 권한 거부·장치 없음: 게임은 계속하고, 이 차례는 기록 실패로 남긴다.
      current.failed = true
      this.setStatus('failed')
    }
  }

  /** 액션을 보낸 순간 부른다. 서버가 거절하면 resume으로 이어서 녹음한다. */
  pause() {
    const current = this.current
    if (!current?.recorder || current.recorder.state !== 'recording') return
    current.recorder.pause()
    if (current.resumedAt !== null) current.recordedMs += this.deps.sessionNow() - current.resumedAt
    current.resumedAt = null
    this.setStatus('paused')
  }

  resume() {
    const current = this.current
    if (!current?.recorder || current.recorder.state !== 'paused') return
    current.recorder.resume()
    current.resumedAt = this.deps.sessionNow()
    this.setStatus('recording')
  }

  /**
   * 차례 도중에 음성 기록을 껐을 때 부른다. 마이크를 바로 끄고 남은 조각과 결과는 보내지 않는다.
   * 서버는 이 차례를 `음성 없이`로 바꾸므로 이미 올린 조각도 복기에서 재생하지 않는다.
   */
  discard() {
    const current = this.current
    if (!current) return
    current.discarded = true
    current.stopping = true
    this.current = null
    if (current.recorder && current.recorder.state !== 'inactive') current.recorder.stop()
    for (const track of current.stream?.getTracks() ?? []) track.stop()
    current.meter?.close()
    this.setStatus('idle')
  }

  /** 차례가 끝나면 부른다. 마지막 조각을 올리고 결과를 알린 뒤 마이크를 끈다. */
  async stop() {
    const current = this.current
    if (!current || current.stopping) return
    current.stopping = true
    const recorder = current.recorder

    if (recorder && recorder.state !== 'inactive') {
      if (current.resumedAt !== null) current.recordedMs += this.deps.sessionNow() - current.resumedAt
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
    }
    for (const track of current.stream?.getTracks() ?? []) track.stop()
    const peak = current.meter?.peak()
    current.meter?.close()

    const report: TurnReport = {
      chunks: current.chunks,
      durationMs: Math.max(0, Math.round(current.recordedMs)),
      silent: peak !== undefined && current.chunks > 0 && peak < SILENCE_RMS,
      failed: current.failed && current.chunks === 0,
      audioStartMs: current.startedAt === null ? null : Math.round(current.startedAt),
    }
    // 조각을 모두 올린 다음에 결과를 알린다(같은 줄에 차례대로 넣는다).
    this.queue.push(() => this.deps.sink.completeTurn(current.turnSeq, report))
    if (this.current === current) this.current = null
    this.setStatus('idle')
  }
}
