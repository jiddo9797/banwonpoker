import { describe, expect, it } from 'vitest'
import { httpBaseOf } from './api'
import { resolveServerUrl } from './serverUrl'

describe('resolveServerUrl', () => {
  it('설정한 주소가 있으면 그대로 쓴다', () => {
    expect(resolveServerUrl('wss://game.example/ws', { protocol: 'https:', hostname: 'x', host: 'x' }, false)).toBe('wss://game.example/ws')
  })

  it('개발 서버에서는 같은 호스트의 8787번 포트를 쓴다', () => {
    expect(resolveServerUrl(undefined, { protocol: 'http:', hostname: '192.168.0.12', host: '192.168.0.12:5173' }, true)).toBe(
      'ws://192.168.0.12:8787/ws',
    )
  })

  it('배포에서는 화면을 준 주소의 /ws를 쓰고 HTTPS면 wss로 바꾼다', () => {
    expect(resolveServerUrl(undefined, { protocol: 'https:', hostname: 'bwp.fly.dev', host: 'bwp.fly.dev' }, false)).toBe('wss://bwp.fly.dev/ws')
    expect(resolveServerUrl(undefined, { protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:8790' }, false)).toBe('ws://127.0.0.1:8790/ws')
  })

  it('HTTP 주소는 WebSocket 주소에서 얻는다', () => {
    expect(httpBaseOf('wss://bwp.fly.dev/ws')).toBe('https://bwp.fly.dev')
    expect(httpBaseOf('ws://127.0.0.1:8787/ws')).toBe('http://127.0.0.1:8787')
  })
})
