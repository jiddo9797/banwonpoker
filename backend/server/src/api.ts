import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Clock } from './clock'
import type { ErrorCode } from './protocol'
import { parseTurnReport } from './protocol'
import { buildReplay } from './replay'
import { MAX_CHUNK_BYTES, MAX_CHUNKS_PER_TURN } from './store'
import type { SessionStore } from './store'

/** 세션이 끝난 뒤에도 재전송된 음성 조각을 받아 주는 시간 */
export const LATE_UPLOAD_MS = 10 * 60_000

export interface ApiContext {
  store?: SessionStore
  clock: Clock
  /** CORS를 허용할 Origin인지(host는 요청의 Host 헤더) */
  isAllowedOrigin: (origin: string | undefined, host?: string) => boolean
  /** 배포 환경에서 프론트엔드 빌드 결과를 함께 제공할 폴더 */
  staticDir?: string
}

type HttpError = ErrorCode | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'TOO_LARGE' | 'GONE'

const statusOf: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GONE: 410,
  TOO_LARGE: 413,
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

function sendError(response: ServerResponse, code: HttpError, message: string) {
  sendJson(response, statusOf[code] ?? 400, { ok: false, error: { code, message } })
}

function bearer(request: IncomingMessage) {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

async function readBody(request: IncomingMessage, limit: number): Promise<Uint8Array | 'too-large'> {
  const parts: Uint8Array[] = []
  let size = 0
  for await (const part of request) {
    const chunk = part as Uint8Array
    size += chunk.byteLength
    if (size > limit) return 'too-large'
    parts.push(chunk)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.byteLength
  }
  return body
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  // 포스트플랍 솔버. 이 형식이어야 브라우저가 내려받으면서 바로 컴파일한다.
  '.wasm': 'application/wasm',
}

/** 빌드된 프론트엔드를 제공한다. 없는 경로는 index.html(한 페이지 앱)로 돌린다. */
function serveStatic(request: IncomingMessage, response: ServerResponse, staticDir: string) {
  const root = resolve(staticDir)
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)
  const candidate = resolve(root, `.${pathname}`)
  // ../ 로 폴더 밖 파일을 읽지 못하게 한다.
  const fromRoot = relative(root, candidate)
  const insideRoot = !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
  const file = insideRoot && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, 'index.html')
  if (!existsSync(file)) return false
  const hashed = /\/assets\//.test(pathname)
  response.writeHead(200, {
    'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
    // 해시가 붙은 파일은 오래 캐시하고, index.html은 늘 새로 받게 한다.
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  response.end(readFileSync(file))
  return true
}

const routes = {
  chunk: /^\/api\/sessions\/([\w-]{1,64})\/turns\/(\d{1,9})\/chunks\/(\d{1,4})$/,
  complete: /^\/api\/sessions\/([\w-]{1,64})\/turns\/(\d{1,9})\/complete$/,
  audio: /^\/api\/sessions\/([\w-]{1,64})\/turns\/(\d{1,9})\/audio$/,
  replay: /^\/api\/sessions\/([\w-]{1,64})\/replay$/,
}

/** 이 서버가 준 화면에서 온 요청인지 */
function isSameOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** HTTP 요청을 처리했으면 true. /health는 server.ts가 먼저 처리한다. */
export async function handleHttp(request: IncomingMessage, response: ServerResponse, context: ApiContext): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://local')
  const origin = request.headers.origin

  if (url.pathname.startsWith('/api/')) {
    // 개발 중에는 화면(5173)과 서버(8787)의 Origin이 달라 CORS가 필요하다.
    const sameOrigin = isSameOrigin(origin, request.headers.host)
    if (origin && !sameOrigin && context.isAllowedOrigin(origin, request.headers.host)) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'origin')
      response.setHeader('access-control-allow-headers', 'authorization, content-type')
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    } else if (origin && !sameOrigin) {
      sendError(response, 'FORBIDDEN', '허용하지 않은 사이트에서 온 요청입니다.')
      return true
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return true
    }
    await handleApi(request, response, url.pathname, context)
    return true
  }

  if (context.staticDir && request.method === 'GET') return serveStatic(request, response, context.staticDir)
  return false
}

async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string, context: ApiContext) {
  const store = context.store
  if (!store) return sendError(response, 'NOT_FOUND', '이 서버는 기록을 저장하지 않습니다.')

  const match =
    (request.method === 'POST' && (pathname.match(routes.chunk) ?? pathname.match(routes.complete))) ||
    (request.method === 'GET' && (pathname.match(routes.audio) ?? pathname.match(routes.replay)))
  if (!match) return sendError(response, 'NOT_FOUND', '없는 주소입니다.')

  const sessionId = match[1]
  const session = store.getSession(sessionId)
  if (!session) return sendError(response, 'NOT_FOUND', '세션을 찾을 수 없습니다.')
  const participant = store.participantByToken(sessionId, bearer(request))
  if (!participant) return sendError(response, 'UNAUTHORIZED', '이 세션의 참가자만 쓸 수 있습니다.')

  // ── 복기: 세션이 끝난 뒤에만 ──
  if (request.method === 'GET') {
    if (session.endedAt === null) return sendError(response, 'FORBIDDEN', '세션이 끝난 뒤에 볼 수 있습니다.')
    if (routes.replay.test(pathname)) {
      const replay = buildReplay(session, store.participants(sessionId), store.hands(sessionId), store.events(sessionId), store.turns(sessionId))
      return sendJson(response, 200, { ok: true, replay })
    }
    const audio = store.turnAudio(sessionId, Number(match[2]))
    if (!audio) return sendError(response, 'NOT_FOUND', '이 차례의 음성이 없습니다.')
    response.writeHead(200, { 'content-type': 'audio/webm', 'content-length': audio.byteLength, 'cache-control': 'private, max-age=3600' })
    response.end(audio)
    return
  }

  // ── 업로드: 그 차례의 주인만 ──
  const turnSeq = Number(match[2])
  const turn = store.turn(sessionId, turnSeq)
  if (!turn) return sendError(response, 'NOT_FOUND', '없는 차례입니다.')
  if (turn.playerId !== participant.playerId) return sendError(response, 'FORBIDDEN', '내 차례의 음성만 올릴 수 있습니다.')
  if (turn.voiceless) return sendError(response, 'FORBIDDEN', '음성 없이 참여 중에는 음성을 올리지 않습니다.')
  if (session.endedAt !== null && context.clock.now() - session.endedAt > LATE_UPLOAD_MS) {
    return sendError(response, 'GONE', '세션이 끝난 지 오래되어 더 받지 않습니다.')
  }

  if (routes.chunk.test(pathname)) {
    const index = Number(match[3])
    if (index >= MAX_CHUNKS_PER_TURN) return sendError(response, 'BAD_REQUEST', '조각 번호가 너무 큽니다.')
    const body = await readBody(request, MAX_CHUNK_BYTES)
    if (body === 'too-large') return sendError(response, 'TOO_LARGE', '음성 조각이 너무 큽니다.')
    if (body.byteLength === 0) return sendError(response, 'BAD_REQUEST', '빈 조각입니다.')
    const stored = store.saveChunk(sessionId, turnSeq, index, body)
    return sendJson(response, 200, { ok: true, duplicate: !stored })
  }

  const body = await readBody(request, 4 * 1024)
  if (body === 'too-large') return sendError(response, 'TOO_LARGE', '요청이 너무 큽니다.')
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return sendError(response, 'BAD_REQUEST', 'JSON 형식이 아닙니다.')
  }
  const report = parseTurnReport(json)
  if (!report) return sendError(response, 'BAD_REQUEST', '녹음 결과 형식이 올바르지 않습니다.')
  store.reportTurn(sessionId, turnSeq, report)
  return sendJson(response, 200, { ok: true })
}
