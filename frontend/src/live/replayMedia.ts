import type { ExportFile, ReplayAudioPlayer, ReplayExporter } from '../features/replay/ReplayScreen'
import type { HandAction, MixerChannel, ReplayHand } from '../features/replay/model'
import { formatChips } from '../shared/format'
import type { Api } from './api'

/** 차례 음성을 한 번만 받아 두고 다시 쓴다. */
export function createAudioSource(api: Pick<Api, 'fetchTurnAudio'>, sessionId: string, token: string) {
  const cache = new Map<number, Promise<Blob>>()
  return (turnSeq: number) => {
    let blob = cache.get(turnSeq)
    if (!blob) {
      blob = api.fetchTurnAudio(sessionId, turnSeq, token)
      // 실패한 요청은 다음에 다시 받게 한다.
      blob.catch(() => cache.delete(turnSeq))
      cache.set(turnSeq, blob)
    }
    return blob
  }
}

export type AudioSource = ReturnType<typeof createAudioSource>

/** 들을 음성이 있는 칸. 무발언 차례는 조용하므로 틀지 않고 건너뛴다. */
const hasAudio = (action: HandAction) => action.turnSeq !== undefined && action.audio.status === 'voice'

/** 복기 재생: 음성이 있는 칸이면 끝까지 틀고, 참가자별 음량·음소거·재생 속도를 적용한다. */
export function createAudioPlayer(source: AudioSource): ReplayAudioPlayer {
  return {
    play(action, { channel, speed, signal }) {
      if (!hasAudio(action)) return undefined
      return source(action.turnSeq as number).then(
        (blob) =>
          new Promise<void>((resolve, reject) => {
            if (signal.aborted) return resolve()
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            const cleanup = () => {
              audio.pause()
              URL.revokeObjectURL(url)
            }
            audio.volume = channel?.muted ? 0 : (channel?.volume ?? 80) / 100
            audio.playbackRate = speed
            audio.onended = () => {
              cleanup()
              resolve()
            }
            audio.onerror = () => {
              cleanup()
              reject(new Error('음성을 재생하지 못했습니다.'))
            }
            signal.addEventListener('abort', () => {
              cleanup()
              resolve()
            })
            audio.play().catch((error: unknown) => {
              cleanup()
              reject(error instanceof Error ? error : new Error('음성을 재생하지 못했습니다.'))
            })
          }),
      )
    },
  }
}

// ── 내보내기: 음성(WAV) + 기록(텍스트) ─────────────────────────────

const SAMPLE_RATE = 24_000
const GAP_SECONDS = 0.6

/** 16비트 모노 WAV로 인코딩한다. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

const statusText: Record<HandAction['audio']['status'], string> = {
  voice: '음성',
  silent: '무발언',
  failed: '기록 실패',
  missing: '누락',
  voiceless: '음성 없이 참여',
  none: '-',
}

/** 사람이 읽는 핸드 기록 */
export function handLog(hands: ReplayHand[], title: string) {
  const lines = [`# ${title}`, '']
  for (const hand of hands) {
    lines.push(`## 핸드 #${hand.number} · ${hand.result}`)
    lines.push(`참가자: ${hand.players.map((player) => `${player.name}(${player.cards.map((card) => card.rank + { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }[card.suit]).join(' ')})`).join(', ')}`)
    for (const action of hand.actions) {
      if (action.kind === 'result') continue
      const name = hand.players.find((player) => player.id === action.playerId)?.name ?? ''
      const think = action.thinkSeconds ? ` · 생각 ${action.thinkSeconds}초` : ''
      const voice = action.audio.status === 'none' ? '' : ` · ${statusText[action.audio.status]}${action.audio.seconds ? ` ${action.audio.seconds}초` : ''}`
      lines.push(`- [${action.street}] ${name} ${action.label} · 팟 ${formatChips(action.pot)}${think}${voice}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/** 브라우저 안에서 음성을 받아 이어 붙이고 WAV와 기록 파일을 만든다. 서버에 부담을 주지 않는다. */
export function createExporter(source: AudioSource, sessionName: string): ReplayExporter {
  return {
    async run({ scope, hand, hands, mixer, onProgress, signal }) {
      const targets = scope === 'hand' ? [hand] : hands
      const voiced = targets.flatMap((item) => item.actions.filter(hasAudio))
      const decoder = new AudioContext({ sampleRate: SAMPLE_RATE })
      const clips: Array<{ buffer: AudioBuffer; channel: MixerChannel | undefined }> = []
      try {
        for (const [index, action] of voiced.entries()) {
          if (signal.aborted) throw new Error('취소했습니다.')
          const blob = await source(action.turnSeq as number)
          const buffer = await decoder.decodeAudioData(await blob.arrayBuffer())
          clips.push({ buffer, channel: action.playerId ? mixer[action.playerId] : undefined })
          onProgress(((index + 1) / Math.max(1, voiced.length)) * 60)
        }
      } finally {
        void decoder.close()
      }

      const base = scope === 'hand' ? `banwonpoker-hand${hand.number}` : 'banwonpoker-session'
      const files: ExportFile[] = []
      const audible = clips.filter((clip) => !clip.channel?.muted && (clip.channel?.volume ?? 80) > 0)
      if (audible.length > 0) {
        const totalSeconds = audible.reduce((sum, clip) => sum + clip.buffer.duration + GAP_SECONDS, 0)
        const offline = new OfflineAudioContext(1, Math.ceil(totalSeconds * SAMPLE_RATE), SAMPLE_RATE)
        let at = 0
        for (const clip of audible) {
          const node = offline.createBufferSource()
          node.buffer = clip.buffer
          const gain = offline.createGain()
          gain.gain.value = (clip.channel?.volume ?? 80) / 100
          node.connect(gain).connect(offline.destination)
          node.start(at)
          at += clip.buffer.duration + GAP_SECONDS
        }
        onProgress(80)
        const rendered = await offline.startRendering()
        const wav = encodeWav(rendered.getChannelData(0), SAMPLE_RATE)
        files.push({ name: `${base}.wav`, url: URL.createObjectURL(wav), sizeLabel: `${sizeLabel(wav.size)} · ${Math.round(totalSeconds)}초` })
      }

      const log = new Blob([handLog(targets, sessionName)], { type: 'text/plain;charset=utf-8' })
      files.push({ name: `${base}.txt`, url: URL.createObjectURL(log), sizeLabel: `${sizeLabel(log.size)} · 액션 기록` })
      onProgress(100)
      return files
    },
  }
}
