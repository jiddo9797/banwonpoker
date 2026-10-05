import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 교차 출처 격리. 포스트플랍 솔버가 SharedArrayBuffer로 여러 스레드를 쓰려면 문서가 이 헤더로 와야 한다.
 * 배포 서버(backend/server/src/api.ts)도 같은 헤더를 보낸다.
 */
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: isolation },
  preview: { headers: isolation },
  // 솔버 워커가 WASM을 동적으로 불러오고 그 안에서 다시 워커를 띄우므로 ES 모듈 워커로 묶는다.
  worker: { format: 'es' },
})
