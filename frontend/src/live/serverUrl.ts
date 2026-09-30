/**
 * 게임 서버 WebSocket 주소.
 * - VITE_SERVER_URL이 있으면 그 주소
 * - 개발 서버(pnpm dev): 같은 호스트의 8787번 포트. 같은 와이파이의 친구가 http://내IP:5173으로 열어도 된다.
 * - 배포(프로덕션 빌드): 화면을 준 서버와 같은 주소의 /ws
 */
export function resolveServerUrl(
  configured: string | undefined = import.meta.env.VITE_SERVER_URL,
  location: Pick<Location, 'protocol' | 'hostname' | 'host'> = window.location,
  development: boolean = import.meta.env.DEV,
) {
  if (configured) return configured
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  if (development) return `${protocol}://${location.hostname}:8787/ws`
  return `${protocol}://${location.host}/ws`
}
