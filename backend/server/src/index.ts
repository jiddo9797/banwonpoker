import { startGameServer, WS_PATH } from './server'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const server = await startGameServer({ port, host, allowedOrigins })
console.log(`banwonpoker 게임 서버: ws://${host}:${server.port}${WS_PATH} (헬스 체크 http://${host}:${server.port}/health)`)

const shutdown = async () => {
  await server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
