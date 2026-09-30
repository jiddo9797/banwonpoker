/** 게임 서버 WebSocket 주소. 배포할 때는 VITE_SERVER_URL로 정한다. */
export function resolveServerUrl(
  configured: string | undefined = import.meta.env.VITE_SERVER_URL,
  location: Pick<Location, 'protocol' | 'hostname'> = window.location,
) {
  if (configured) return configured
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  // 같은 와이파이의 친구가 http://내IP:5173 으로 열면 서버도 같은 IP의 8787번으로 찾는다.
  return `${protocol}://${location.hostname}:8787/ws`
}
