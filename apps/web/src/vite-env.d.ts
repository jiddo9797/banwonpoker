/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true`면 프로덕션 빌드에도 프로토타입 개발 도구를 포함한다. */
  readonly VITE_DEVTOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
