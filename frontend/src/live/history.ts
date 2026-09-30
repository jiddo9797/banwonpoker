/** 끝난 세션을 다시 복기할 수 있게 이 브라우저에 남겨 두는 목록 */
export interface PastSession {
  sessionId: string
  /** 그 세션에 들어갈 때 받은 토큰. 서버는 이 토큰으로 참가자인지 확인한다. */
  token: string
  playerId: string
  name: string
  endedAt: number
}

export const HISTORY_KEY = 'banwonpoker.history'
const MAX_SESSIONS = 20

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function storage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readHistory(store: StorageLike | null = storage()): PastSession[] {
  try {
    const parsed = JSON.parse(store?.getItem(HISTORY_KEY) ?? '[]') as PastSession[]
    return Array.isArray(parsed) ? parsed.filter((item) => item.sessionId && item.token) : []
  } catch {
    return []
  }
}

export function rememberSession(session: PastSession, store: StorageLike | null = storage()) {
  const rest = readHistory(store).filter((item) => item.sessionId !== session.sessionId)
  try {
    store?.setItem(HISTORY_KEY, JSON.stringify([session, ...rest].slice(0, MAX_SESSIONS)))
  } catch {
    // 저장할 수 없으면 이번 화면에서만 복기할 수 있다.
  }
}
