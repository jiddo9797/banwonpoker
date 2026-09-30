/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true`면 프로덕션 빌드에도 프로토타입 개발 도구를 포함한다. */
  readonly VITE_DEVTOOLS?: string
  /** 게임 서버 WebSocket 주소. 없으면 지금 페이지의 호스트 8787번 포트(/ws)를 쓴다. */
  readonly VITE_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
