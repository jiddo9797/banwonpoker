import type { FlowState } from './flow'

/** URL 쿼리를 현재 화면에 맞춘다. 목 결과용 일회성 파라미터(mic, export 등)는 지운다. */
export function buildFlowSearch(state: FlowState, current: URLSearchParams): string {
  const next = new URLSearchParams()
  next.set('screen', state.screen)
  if (state.screen === 'table') next.set('scenario', state.scenarioKey)
  if (state.screen === 'table' && state.voiceless) next.set('voiceless', '1')
  if (state.screen === 'replay' && state.replayHandNumber) next.set('hand', String(state.replayHandNumber))
  const devtools = current.get('devtools')
  if (devtools) next.set('devtools', devtools)
  return `?${next.toString()}`
}
