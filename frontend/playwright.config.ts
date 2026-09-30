import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
/** E2E 전용 게임 서버 포트. 개발용 8787과 겹치지 않게 둔다. */
const GAME_SERVER_PORT = 8788
const isCI = Boolean(process.env.CI)
/** E2E 게임 서버의 기록(DB·음성)을 둘 임시 폴더 */
const GAME_DATA_DIR = fileURLToPath(new URL(`./test-results/game-data-${Date.now()}`, import.meta.url))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  // 기준 이미지는 OS마다 글꼴 렌더링이 달라 플랫폼별로 따로 둔다.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    // 실제 게임 서버. live.spec.ts가 여기에 붙는다.
    {
      command: 'pnpm --filter @banwonpoker/server start',
      url: `http://127.0.0.1:${GAME_SERVER_PORT}/health`,
      env: { PORT: String(GAME_SERVER_PORT), HOST: '127.0.0.1', ALLOWED_ORIGINS: `http://localhost:${PORT}`, DATA_DIR: GAME_DATA_DIR },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    // 프로덕션 빌드로 검사한다. 개발 도구가 빠진 실제 화면이 기준 이미지가 된다.
    {
      command: `pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: { VITE_SERVER_URL: `ws://127.0.0.1:${GAME_SERVER_PORT}/ws` },
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
})
