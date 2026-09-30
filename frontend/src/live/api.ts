import type { ReplayData, TurnReport } from '@banwonpoker/server/protocol'
import { resolveServerUrl } from './serverUrl'

/** WebSocket 주소(ws://host:port/ws)에서 같은 서버의 HTTP 주소를 얻는다. */
export function httpBaseOf(wsUrl: string) {
  const url = new URL(wsUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ApiOptions {
  base?: string
  fetch?: typeof fetch
}

function requester({ base = httpBaseOf(resolveServerUrl()), fetch: doFetch = (...args) => fetch(...args) }: ApiOptions = {}) {
  return async (path: string, token: string, init: RequestInit = {}) => {
    // 토큰은 주소가 아니라 헤더로 보낸다(주소는 기록에 남을 수 있다).
    const response = await doFetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      let message = `요청이 실패했습니다(${response.status}).`
      try {
        const body = (await response.json()) as { error?: { message?: string } }
        if (body.error?.message) message = body.error.message
      } catch {
        // 본문이 JSON이 아니면 기본 문구를 쓴다.
      }
      throw new ApiError(response.status, message)
    }
    return response
  }
}

export function createApi(options: ApiOptions = {}) {
  const request = requester(options)
  return {
    uploadChunk: (sessionId: string, turnSeq: number, index: number, chunk: Blob, token: string) =>
      request(`/api/sessions/${sessionId}/turns/${turnSeq}/chunks/${index}`, token, {
        method: 'POST',
        headers: { 'content-type': chunk.type || 'audio/webm' },
        body: chunk,
      }).then(() => undefined),

    completeTurn: (sessionId: string, turnSeq: number, report: TurnReport, token: string) =>
      request(`/api/sessions/${sessionId}/turns/${turnSeq}/complete`, token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      }).then(() => undefined),

    fetchReplay: (sessionId: string, token: string) =>
      request(`/api/sessions/${sessionId}/replay`, token)
        .then((response) => response.json() as Promise<{ replay: ReplayData }>)
        .then((body) => body.replay),

    fetchTurnAudio: (sessionId: string, turnSeq: number, token: string) =>
      request(`/api/sessions/${sessionId}/turns/${turnSeq}/audio`, token).then((response) => response.blob()),
  }
}

export type Api = ReturnType<typeof createApi>
