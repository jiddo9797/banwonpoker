import { describe, expect, it } from 'vitest'
import { getTableSnapshot } from '../table/fixtures'
import { getReplayHand, HERO_ID, sessionSummary } from './fixtures'
import { createInitialReplayState, DEFAULT_VOLUME, replayReducer } from './reducer'

const hand24 = getReplayHand(24)
const lastIndex = hand24.actions.length - 1

describe('복기 fixture', () => {
  it('핸드 #24의 최종 팟이 테이블 쇼다운 시나리오와 같다', () => {
    const showdownPot = getTableSnapshot('showdown').pots[0].amount
    expect(hand24.actions[lastIndex].pot).toBe(showdownPot)
    expect(hand24.result).toContain('+6,650')
  })

  it('보드와 내 홀카드가 테이블 fixture와 같다', () => {
    const showdown = getTableSnapshot('showdown')
    expect(hand24.board).toEqual(showdown.board)
    expect(hand24.players.find((player) => player.id === HERO_ID)?.cards).toEqual(showdown.heroCards)
  })

  it('결과 칸이 아니면 참가자가 있고, 음성 칸에는 길이가 있다', () => {
    for (const hand of [getReplayHand(23), hand24]) {
      for (const action of hand.actions) {
        if (action.kind === 'result') continue
        expect(hand.players.some((player) => player.id === action.playerId)).toBe(true)
        if (action.audio.status === 'voice') expect(action.audio.seconds).toBeGreaterThan(0)
      }
    }
  })

  it('팟은 줄어들지 않는다', () => {
    hand24.actions.reduce((previous, action) => {
      expect(action.pot).toBeGreaterThanOrEqual(previous)
      return action.pot
    }, 0)
  })

  it('무발언·기록 실패·누락·음성 없이 참여가 모두 한 번 이상 나온다', () => {
    const statuses = new Set(hand24.actions.map((action) => action.audio.status))
    expect([...statuses]).toEqual(expect.arrayContaining(['voice', 'silent', 'failed', 'missing', 'voiceless']))
  })

  it('세션 결과 칩의 합이 보존된다', () => {
    const { results, startingStack } = sessionSummary
    expect(results.reduce((sum, result) => sum + result.delta, 0)).toBe(0)
    expect(results.reduce((sum, result) => sum + result.finalStack, 0)).toBe(startingStack * results.length)
    for (const result of results) expect(result.finalStack - startingStack).toBe(result.delta)
  })

  it('내 음성 기록 통계의 합이 내 차례 수와 같다', () => {
    const { turns, saved, silent, failed, missing } = sessionSummary.selfRecording
    expect(saved + silent + failed + missing).toBe(turns)
  })
})

describe('createInitialReplayState', () => {
  it('최신 핸드 첫 칸에서 일시정지 상태로 시작하고 모든 참가자 음량을 기본값으로 둔다', () => {
    const state = createInitialReplayState()
    expect(state).toMatchObject({ handNumber: 24, index: 0, playing: false, speed: 1, exportStatus: 'closed' })
    expect(Object.keys(state.mixer)).toHaveLength(hand24.players.length)
    expect(Object.values(state.mixer)).toEqual(
      hand24.players.map(() => ({ volume: DEFAULT_VOLUME, muted: false })),
    )
  })

  it('범위를 벗어난 첫 위치는 마지막 칸으로 맞춘다', () => {
    expect(createInitialReplayState({ index: 999 }).index).toBe(lastIndex)
  })

  it('알 수 없는 핸드는 최신 핸드로 연다', () => {
    expect(createInitialReplayState({ handNumber: 1 }).handNumber).toBe(24)
  })
})

describe('재생', () => {
  it('재생 중 틱마다 한 칸씩 이동하고 마지막 칸에서 멈춘다', () => {
    let state = replayReducer(createInitialReplayState({ index: lastIndex - 2 }), { type: 'playback.toggled' })
    expect(state.playing).toBe(true)

    state = replayReducer(state, { type: 'playback.ticked' })
    expect(state).toMatchObject({ index: lastIndex - 1, playing: true })

    state = replayReducer(state, { type: 'playback.ticked' })
    expect(state).toMatchObject({ index: lastIndex, playing: false })
  })

  it('일시정지 상태에서는 틱을 무시한다', () => {
    const paused = createInitialReplayState()
    expect(replayReducer(paused, { type: 'playback.ticked' })).toBe(paused)
  })

  it('마지막 칸에서 재생하면 처음부터 다시 재생한다', () => {
    const state = replayReducer(createInitialReplayState({ index: lastIndex }), { type: 'playback.toggled' })
    expect(state).toMatchObject({ index: 0, playing: true })
  })

  it('이전·다음 이동과 칸 선택은 범위 안으로 제한한다', () => {
    const start = createInitialReplayState()
    expect(replayReducer(start, { type: 'playback.stepped', delta: -1 }).index).toBe(0)
    expect(replayReducer(start, { type: 'playback.stepped', delta: 1 }).index).toBe(1)
    expect(replayReducer(start, { type: 'action.selected', index: 500 }).index).toBe(lastIndex)
  })

  it('핸드를 바꾸면 첫 칸에서 멈춘다', () => {
    const playing = { ...createInitialReplayState({ index: 5 }), playing: true }
    const state = replayReducer(playing, { type: 'hand.changed', handNumber: 23 })
    expect(state).toMatchObject({ handNumber: 23, index: 0, playing: false })
    expect(replayReducer(state, { type: 'hand.changed', handNumber: 23 })).toBe(state)
  })

  it('재생 속도를 바꾼다', () => {
    expect(replayReducer(createInitialReplayState(), { type: 'speed.changed', speed: 1.5 }).speed).toBe(1.5)
  })
})

describe('참가자 음량', () => {
  it('음량은 0~100으로 제한하고, 올리면 음소거를 푼다', () => {
    let state = replayReducer(createInitialReplayState(), { type: 'mixer.muteToggled', playerId: 'subin' })
    expect(state.mixer.subin).toEqual({ volume: DEFAULT_VOLUME, muted: true })

    state = replayReducer(state, { type: 'mixer.volumeChanged', playerId: 'subin', volume: 140 })
    expect(state.mixer.subin).toEqual({ volume: 100, muted: false })

    state = replayReducer(state, { type: 'mixer.volumeChanged', playerId: 'subin', volume: -5 })
    expect(state.mixer.subin.volume).toBe(0)
  })

  it('없는 참가자는 무시한다', () => {
    const state = createInitialReplayState()
    expect(replayReducer(state, { type: 'mixer.muteToggled', playerId: 'ghost' })).toBe(state)
    expect(replayReducer(state, { type: 'mixer.volumeChanged', playerId: 'ghost', volume: 10 })).toBe(state)
  })
})

describe('영상 내보내기', () => {
  it('옵션 → 생성 중 → 완료 순서로 진행하고 재생을 멈춘다', () => {
    let state = replayReducer({ ...createInitialReplayState(), playing: true }, { type: 'export.opened' })
    expect(state).toMatchObject({ exportStatus: 'options', playing: false })

    state = replayReducer(state, { type: 'export.scopeChanged', scope: 'session' })
    state = replayReducer(state, { type: 'export.started' })
    expect(state).toMatchObject({ exportStatus: 'generating', exportProgress: 0, exportScope: 'session' })

    state = replayReducer(state, { type: 'export.progressed', progress: 40 })
    expect(state.exportProgress).toBe(40)
    // 진행률은 되돌아가지 않는다.
    expect(replayReducer(state, { type: 'export.progressed', progress: 10 }).exportProgress).toBe(40)

    state = replayReducer(state, { type: 'export.completed' })
    expect(state).toMatchObject({ exportStatus: 'done', exportProgress: 100 })
  })

  it('실패 후 다시 시도하면 0%부터 다시 만든다', () => {
    let state = createInitialReplayState({ exportStatus: 'generating' })
    state = replayReducer(state, { type: 'export.failed' })
    expect(state.exportStatus).toBe('failed')

    state = replayReducer(state, { type: 'export.started' })
    expect(state).toMatchObject({ exportStatus: 'generating', exportProgress: 0 })
  })

  it('생성 중이 아니면 진행·완료·실패 이벤트를 무시한다', () => {
    const options = replayReducer(createInitialReplayState(), { type: 'export.opened' })
    expect(replayReducer(options, { type: 'export.progressed', progress: 50 })).toBe(options)
    expect(replayReducer(options, { type: 'export.completed' })).toBe(options)
    expect(replayReducer(options, { type: 'export.failed' })).toBe(options)
  })

  it('닫으면 진행률을 초기화한다', () => {
    const state = replayReducer(createInitialReplayState({ exportStatus: 'done' }), { type: 'export.closed' })
    expect(state).toMatchObject({ exportStatus: 'closed', exportProgress: 0 })
  })
})
