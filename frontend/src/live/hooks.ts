import { useEffect, useState, useSyncExternalStore } from 'react'
import { LiveClient } from './client'
import { resolveServerUrl } from './serverUrl'

let shared: LiveClient | null = null

function safeStorage(kind: 'sessionStorage' | 'localStorage') {
  try {
    return window[kind]
  } catch {
    return null
  }
}

/** 앱 전체에서 하나만 쓰는 서버 연결 */
export function getLiveClient() {
  shared ??= new LiveClient({ url: resolveServerUrl(), storage: [safeStorage('sessionStorage'), safeStorage('localStorage')] })
  return shared
}

export function useLiveSnapshot(client: LiveClient) {
  return useSyncExternalStore(client.subscribe, client.getSnapshot)
}

/** 서버 기준 현재 시각. 타이머 숫자를 위해 자주 갱신한다. */
export function useServerNow(offset: number, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now + offset
}
