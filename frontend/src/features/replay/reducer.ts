import { replayHands } from './fixtures'
import type { ExportStatus, MixerChannel, ReplayAction, ReplayHand, ReplayState } from './model'

export const DEFAULT_VOLUME = 80

/** 번호로 핸드를 찾는다. 없으면 마지막 핸드 */
export function handOf(hands: ReplayHand[], handNumber: number): ReplayHand {
  return hands.find((hand) => hand.number === handNumber) ?? hands[hands.length - 1]
}

function clampIndex(index: number, hand: ReplayHand) {
  return Math.min(hand.actions.length - 1, Math.max(0, index))
}

/** 세션에 나온 모든 참가자의 음량. 핸드를 바꿔도 설정이 유지된다. */
function createMixer(hands: ReplayHand[]): Record<string, MixerChannel> {
  const ids = new Set(hands.flatMap((hand) => hand.players.map((player) => player.id)))
  return Object.fromEntries([...ids].map((id) => [id, { volume: DEFAULT_VOLUME, muted: false }]))
}

interface InitialReplayOptions {
  hands?: ReplayHand[]
  handNumber?: number
  index?: number
  exportStatus?: ExportStatus
}

export function createInitialReplayState({
  hands = replayHands,
  handNumber,
  index = 0,
  exportStatus = 'closed',
}: InitialReplayOptions = {}): ReplayState {
  const hand = handOf(hands, handNumber ?? hands[hands.length - 1].number)

  return {
    hands,
    handNumber: hand.number,
    index: clampIndex(index, hand),
    playing: false,
    speed: 1,
    mixer: createMixer(hands),
    exportStatus,
    exportProgress: exportStatus === 'done' ? 100 : exportStatus === 'failed' ? 60 : exportStatus === 'generating' ? 40 : 0,
    exportScope: 'hand',
  }
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'hand.changed': {
      const hand = handOf(state.hands, action.handNumber)
      if (hand.number === state.handNumber) return state
      return { ...state, handNumber: hand.number, index: 0, playing: false }
    }

    case 'action.selected':
      return { ...state, index: clampIndex(action.index, handOf(state.hands, state.handNumber)) }

    case 'playback.toggled': {
      const lastIndex = handOf(state.hands, state.handNumber).actions.length - 1
      // 마지막 칸에서 재생을 누르면 처음부터 다시 재생한다.
      if (!state.playing && state.index >= lastIndex) return { ...state, index: 0, playing: true }
      return { ...state, playing: !state.playing }
    }

    case 'playback.stepped':
      return { ...state, index: clampIndex(state.index + action.delta, handOf(state.hands, state.handNumber)) }

    case 'playback.ticked': {
      if (!state.playing) return state
      const lastIndex = handOf(state.hands, state.handNumber).actions.length - 1
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
