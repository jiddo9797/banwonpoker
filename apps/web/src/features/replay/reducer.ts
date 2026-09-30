import { getReplayHand, LATEST_HAND_NUMBER } from './fixtures'
import type { ExportStatus, MixerChannel, ReplayAction, ReplayState } from './model'

export const DEFAULT_VOLUME = 80

function clampIndex(index: number, handNumber: number) {
  const lastIndex = getReplayHand(handNumber).actions.length - 1
  return Math.min(lastIndex, Math.max(0, index))
}

function createMixer(handNumber: number): Record<string, MixerChannel> {
  return Object.fromEntries(
    getReplayHand(handNumber).players.map((player) => [player.id, { volume: DEFAULT_VOLUME, muted: false }]),
  )
}

interface InitialReplayOptions {
  handNumber?: number
  index?: number
  exportStatus?: ExportStatus
}

export function createInitialReplayState({
  handNumber = LATEST_HAND_NUMBER,
  index = 0,
  exportStatus = 'closed',
}: InitialReplayOptions = {}): ReplayState {
  const hand = getReplayHand(handNumber)

  return {
    handNumber: hand.number,
    index: clampIndex(index, hand.number),
    playing: false,
    speed: 1,
    mixer: createMixer(hand.number),
    exportStatus,
    exportProgress: exportStatus === 'done' ? 100 : exportStatus === 'failed' ? 60 : exportStatus === 'generating' ? 40 : 0,
    exportScope: 'hand',
  }
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'hand.changed': {
      const hand = getReplayHand(action.handNumber)
      if (hand.number === state.handNumber) return state
      return { ...state, handNumber: hand.number, index: 0, playing: false }
    }

    case 'action.selected':
      return { ...state, index: clampIndex(action.index, state.handNumber) }

    case 'playback.toggled': {
      const lastIndex = getReplayHand(state.handNumber).actions.length - 1
      // 마지막 칸에서 재생을 누르면 처음부터 다시 재생한다.
      if (!state.playing && state.index >= lastIndex) return { ...state, index: 0, playing: true }
      return { ...state, playing: !state.playing }
    }

    case 'playback.stepped':
      return { ...state, index: clampIndex(state.index + action.delta, state.handNumber) }

    case 'playback.ticked': {
      if (!state.playing) return state
      const lastIndex = getReplayHand(state.handNumber).actions.length - 1
      if (state.index >= lastIndex) return { ...state, playing: false }
      const index = state.index + 1
      return { ...state, index, playing: index < lastIndex }
    }

    case 'speed.changed':
      return { ...state, speed: action.speed }

    case 'mixer.volumeChanged': {
      const channel = state.mixer[action.playerId]
      if (!channel) return state
      const volume = Math.min(100, Math.max(0, Math.round(action.volume)))
      return {
        ...state,
        // 음량을 올리면 음소거를 풀어 준다.
        mixer: { ...state.mixer, [action.playerId]: { volume, muted: volume === 0 ? channel.muted : false } },
      }
    }

    case 'mixer.muteToggled': {
      const channel = state.mixer[action.playerId]
      if (!channel) return state
      return { ...state, mixer: { ...state.mixer, [action.playerId]: { ...channel, muted: !channel.muted } } }
    }

    case 'export.opened':
      return { ...state, playing: false, exportStatus: 'options', exportProgress: 0 }

    case 'export.scopeChanged':
      return { ...state, exportScope: action.scope }

    case 'export.started':
      if (state.exportStatus === 'generating') return state
      return { ...state, exportStatus: 'generating', exportProgress: 0 }

    case 'export.progressed':
      if (state.exportStatus !== 'generating') return state
      return { ...state, exportProgress: Math.min(100, Math.max(state.exportProgress, action.progress)) }

    case 'export.completed':
      if (state.exportStatus !== 'generating') return state
      return { ...state, exportStatus: 'done', exportProgress: 100 }

    case 'export.failed':
      if (state.exportStatus !== 'generating') return state
      return { ...state, exportStatus: 'failed' }

    case 'export.closed':
      return { ...state, exportStatus: 'closed', exportProgress: 0 }
  }
}
