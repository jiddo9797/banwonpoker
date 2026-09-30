import { resolve } from 'node:path'
import { startGameServer, WS_PATH } from './server'
import { SessionStore } from './store'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const dataDir = resolve(process.env.DATA_DIR ?? 'data')
const staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : undefined
const store = new SessionStore(dataDir)

const server = await startGameServer({ port, host, allowedOrigins, store, staticDir })
console.log(`banwonpoker 게임 서버: ws://${host}:${server.port}${WS_PATH} (헬스 체크 http://${host}:${server.port}/health)`)
console.log(`기록 저장 위치: ${dataDir}${staticDir ? ` · 화면 제공: ${staticDir}` : ''}`)

const shutdown = async () => {
  await server.close()
  store.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
